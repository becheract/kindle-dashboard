# Get books from your server on your Kindle

This sets up a book library on the same Ubuntu server that runs Kindle Dashboard, and
connects KOReader on your Kindle to it. From the Kindle you can then browse the library
and download any book over Wi‑Fi, with no USB cable.

It uses Calibre's content server, which publishes your library as an **OPDS catalog**.
OPDS is the standard KOReader uses to browse online bookshelves. Like Kindle Dashboard,
it only works on your home network.

You need:

- The Ubuntu server, with `sudo` and this repo cloned (see [the main guide](GUIDE.md)).
- A Kindle with KOReader installed.
- Books without DRM. KOReader reads EPUB best, and also opens AZW3, MOBI and PDF.
  Books bought from Amazon are DRM-protected and won't open in KOReader.

---

## Part 1: Set up the library on the server

### 1. Install Calibre

```bash
sudo apt update
sudo apt install -y calibre
```

This installs the full Calibre app, but you'll only use two command-line parts of it:
`calibre-server` (serves the library) and `calibredb` (adds books). No desktop needed.

### 2. Make a user and a folder for the library

```bash
sudo useradd --system --create-home --home-dir /var/lib/calibre --shell /usr/sbin/nologin calibre
sudo -u calibre mkdir -p /var/lib/calibre/library
```

### 3. Add your first books

Copy some books onto the server first. From Windows, PowerShell has `scp` built in:

```powershell
scp C:\Users\you\Books\*.epub you@192.168.1.50:/tmp/books/
```

(Run `mkdir /tmp/books` on the server first.) Then add them to the library:

```bash
sudo chmod -R a+r /tmp/books
sudo -u calibre calibredb add --recurse /tmp/books --with-library /var/lib/calibre/library
```

**Books already on the server?** Skip the copy and point `calibredb add` at that folder
instead, for example `/srv/Books`. If you reach it from Windows as a mapped drive like
`M:\Books`, run `net use` in PowerShell to see its share name, then find the matching
`path =` line on the server with `grep -B1 -A3 -i books /etc/samba/smb.conf`. If the
`calibre` user can't read the folder, give it read access without changing anything else:
`sudo setfacl -R -m u:calibre:rX /srv/Books`.

The first `calibredb add` also creates the library. Calibre reads each book's title,
author and cover, so you don't need to tidy file names. Delete `/tmp/books` afterwards.

### 4. Create a login for the Kindle

```bash
sudo -u calibre calibre-server --userdb /var/lib/calibre/users.sqlite --manage-users
```

Choose **Add a new user**, and give it a name (for example `kindle`) and a password.
Then choose to quit. Anyone else in the house can get their own login the same way.

### 5. Run it as a service

From the `kindle-dashboard` folder:

```bash
sudo cp deploy/calibre-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now calibre-server
```

Check it's running with `systemctl status calibre-server`. If Ubuntu's firewall is on,
open the port to your home network:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 8080
```

### 6. Test it from your computer

Open `http://192.168.1.50:8080` in a browser (use your server's address, the same one
Kindle Dashboard uses, with `:8080`). Log in with the user from step 4 and you'll see
your books. The address KOReader needs is the same with `/opds` on the end:
`http://192.168.1.50:8080/opds`.

---

## Part 2: Add the server to KOReader

1. On the Kindle, open KOReader and go to the **file browser** (the home screen listing your files).
2. Tap the top of the screen to open the menu, then tap the **magnifying glass** tab.
3. Choose **OPDS catalog**.
4. Tap the **+** in the top corner and fill in:
   - **Catalog name:** `Home library`
   - **Catalog URL:** `http://192.168.1.50:8080/opds`
   - **Username** and **Password:** the login from step 4
5. Tap **Save**. **Home library** now appears in the list.

To get a book: open **Home library**, browse or search, tap a book, and pick a format
(choose **EPUB** if offered). KOReader downloads it to its download folder and offers to
open it. You can change the folder with the **folder** icon at the top of the catalog.

If the Kindle can't connect, check that Wi‑Fi is on in KOReader, that the address has
`http://` and not `https://`, and that you can open the same address from your phone.

---

## Adding more books later

Copy the files to the server, then add them while the service is running:

```bash
sudo chmod -R a+r /tmp/books
calibredb add --recurse /tmp/books --with-library http://localhost:8080
```

The new books show up in KOReader the next time you open the catalog. If your books live
in a folder on the server, you can re-run the same command on that folder whenever you add
some. Calibre skips books it already has (same title and author). To remove a book,
find its id with `calibredb list --with-library http://localhost:8080` and run
`calibredb remove <id> --with-library http://localhost:8080`.

## Backups

The whole library, books and covers included, is in `/var/lib/calibre/library`:

```bash
sudo tar czf ~/calibre-library-backup-$(date +%F).tar.gz -C /var/lib/calibre library
```

## How this fits with Kindle Dashboard

The two run side by side on the same server: the library on port 8080 and Kindle Dashboard
on port 3000. They don't share data. The library is where books come from, and the
dashboard is where your highlights, notes and looked-up words end up after you read.

One thing to know: books you read in **KOReader** keep their highlights and word lookups
in KOReader's own files, not in `My Clippings.txt` or `vocab.db`. The dashboard can't
read those yet. Support for KOReader is next on the [roadmap](../README.md#roadmap).
