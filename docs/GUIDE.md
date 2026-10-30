# Kindle Dashboard guide

Kindle Dashboard is a private website for your Kindle reading. It shows every book you've
read and, for each one, your highlights, the notes you typed, and the words you
looked up, with the sentence you found them in and their definition.

This guide has two parts:

- [Part 1: Setting up the server](#part-1-setting-up-the-server). One person does this once.
- [Part 2: Using Kindle Dashboard](#part-2-using-kindle-dashboard). This is for everyone who reads.

---

## Part 1: Setting up the server

Kindle Dashboard runs on an Ubuntu computer on your home network. Anyone on the same Wi‑Fi
can use it. It isn't reachable from outside your home.

### What you need

- Ubuntu 22.04 or newer, with `sudo` access
- `git`. Install it with `sudo apt install -y git` if you don't have it.

You don't need Docker. The installer installs Node.js 22 for you if it's missing.

### Install

```bash
git clone https://github.com/becheract/kindle-dashboard.git
cd kindle-dashboard
sudo ./deploy/install.sh
```

When it finishes, it prints the address to open, for example
`http://192.168.1.50:3000`. Bookmark that address on your phone and computer.

What the installer sets up:

| What | Where |
| --- | --- |
| The app | `/opt/kindle-dashboard` |
| Your data (one database file) | `/var/lib/kindle-dashboard/kindle-dashboard.db` |
| Settings | `/etc/kindle-dashboard.env` |
| Background service | `kindle-dashboard` (starts automatically when the server boots) |

### Settings

Edit `/etc/kindle-dashboard.env` with `sudo nano /etc/kindle-dashboard.env`, then run
`sudo systemctl restart kindle-dashboard`.

- **`TZ`**: your time zone, so word lookups show the right time. Example: `America/Toronto`.
- **`PORT`**: the port the site listens on. The default is `3000`.
- **`ALLOW_SIGNUP`**: set this to `false` once everyone has made an account, so nobody else can sign up.

### If you can't open the site from another device

- Make sure the other device is on the same Wi‑Fi as the server.
- If Ubuntu's firewall is on, allow the port from your home network:
  `sudo ufw allow from 192.168.0.0/16 to any port 3000`
- Check that it's running with `systemctl status kindle-dashboard`. See the log with `journalctl -u kindle-dashboard -n 50`.

### Updating

```bash
cd kindle-dashboard
git pull
sudo ./deploy/install.sh
```

Updating keeps your data and settings.

### Backups

Everything lives in `/var/lib/kindle-dashboard/kindle-dashboard.db`. To make a backup:

```bash
sudo cp /var/lib/kindle-dashboard/kindle-dashboard.db ~/kindle-dashboard-backup-$(date +%F).db
```

---

## Part 2: Using Kindle Dashboard

### 1. Create your account

Open the site address on your computer and choose **Create an account**. Your books
are private. Other people on the same server only see their own.

### 2. Get the files off your Kindle

1. Connect your Kindle to your computer with a USB cable. If it doesn't appear, try another
   cable, because many cables only charge.
2. Open the Kindle drive. You need two files:

   | File | What's in it |
   | --- | --- |
   | `documents/My Clippings.txt` | Your highlights and notes |
   | `system/vocabulary/vocab.db` | Words you looked up in the dictionary |

   The `system` folder can be hidden. On Windows, go to File Explorer → **View** → **Show** → **Hidden items**.
   On a Mac, press **Cmd + Shift + .** in Finder.

### 3. Upload

Go to **Upload**, pick one or both files, and choose **Upload**. You'll go back to your
library with the books filled in.

You can upload as often as you like. Each upload only adds what's new and never
removes anything. If you clear `My Clippings.txt` on your Kindle, your history stays
on the site.

### 4. Browse

- The **Library** shows each book with counts of highlights, notes and words. The most recently read book is first.
- Open a book to see three tabs:
  - **Highlights** shows each highlight with the note you typed on it underneath.
  - **Notes** shows notes that weren't attached to a highlight.
  - **Words** shows each word you looked up, its definition, and the sentence it came from.
    Words you marked as mastered in Vocabulary Builder get a "mastered" tag.

Definitions come from a free online dictionary and are saved after the first lookup. If a
word shows "Definition unavailable", the dictionary couldn't be reached. Reload later.

### 5. Automatic sync (coming soon)

Under **Settings** you'll find your **sync key** and **sync address**. A jailbroken
Kindle will use these to send new highlights and words over Wi‑Fi without plugging
it in. Treat the key like a password. **Make a new key** turns the old one off.

To test the sync from a computer:

```bash
curl -H "Authorization: Bearer YOUR_SYNC_KEY" \
  -F clippings=@"My Clippings.txt" -F vocab=@vocab.db \
  http://192.168.1.50:3000/api/sync
```

---

## Things to know

- **Duplicate highlights.** When you stretch or redo a highlight, the Kindle keeps both
  versions. Kindle Dashboard shows only the longer one.
- **Messy titles.** Books you added yourself often have file-name titles like
  `Title -- Author -- 2010 -- …`. Kindle Dashboard tidies these into a title and author.
- **The same book twice.** Two different files of the same book show as two books.
- **Deleted highlights.** The Kindle doesn't record deletions in `My Clippings.txt`, so a highlight you deleted can still appear.
- **Language.** Dates and definitions currently assume an English Kindle.
