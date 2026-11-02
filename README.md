<p align="center"><img src="www/gwgtv-logo.png" width="100" alt="GWG TV"></p>
<h1 align="center">GWG TV Member Space</h1>
<p align="center"><strong>Your production workspace. On your Mac.</strong><br>Gear · Shoot plans · Clip progress · Training · Equipment reports</p>
<p align="center">
<a href="https://github.com/ludinghauserp-sudo/gwg-tv-memberspace-local/releases/latest"><strong>Download the latest version</strong></a> ·
<a href="#run-the-local-web-version">Local web setup</a> ·
<a href="#edit-and-rebuild-without-nodejs">Developer guide</a>
</p>

## Download & install

Choose either version. Both include the same member tools and save locally. **Apple Silicon Mac · macOS 13+ · No Node.js needed.**

| Version | Download | How to start |
| --- | --- | --- |
| **Mac desktop app** | [Download DMG](https://github.com/ludinghauserp-sudo/gwg-tv-memberspace-local/releases/latest/download/GWG-TV-MemberSpace-1.0.0-arm64.dmg) | Open the DMG → drag the app to Applications → open it. |
| **Local web app + complete source** | [Download ZIP](https://github.com/ludinghauserp-sudo/gwg-tv-memberspace-local/releases/latest/download/GWG-TV-MemberSpace-Local.zip) | Unzip → open the folder → double-click `Start.command`. |

**First launch:** these downloads are ad hoc signed, not Apple notarized. If macOS blocks opening, review it in **System Settings → Privacy & Security → Open Anyway**. No paid account, server or package installation is needed.

> **Private by design:** data stays in your local workspace. This edition does not connect to the live GWG TV inventory or require a member login. The browser version still runs a small native Swift service on your own Mac; it is not a hosted website.

## How it works

The GWG TV Member Space as a local browser app and a macOS desktop app. Both use the same React interface and save to a native Swift/SQLite service on this Mac. **Node.js, npm, Python, cloud accounts and an internet connection are not required to start either version.**

## Run the local web version

Double-click **Start.command** in this folder, or run:

```sh
./start.sh
```

Your default browser opens http://127.0.0.1:8765/members. Keep the Terminal window open while using it. Press Control-C to stop. If macOS does not allow opening the launcher, run `./start.sh` from Terminal instead.

Data is saved in **Data/** beside the launcher. Keep the entire folder together. Starting it again reopens the same workspace. To use a different port: `GWG_PORT=8767 ./start.sh`.

## Run the Mac app

Open the supplied DMG, drag **GWG TV Member Space.app** to Applications, and open it. It has its own local service and does not require Terminal. Requires an **Apple Silicon Mac, macOS 13 or later**. This build is ad hoc signed, not Developer ID notarized; macOS may require approval to open an app from an unidentified developer.

The Mac app stores data separately in:

```
~/Library/Application Support/GWG TV Member Space/
```

Use **Backup & transfer** on the homepage to move a complete workspace between the Mac app and browser version. Backups include uploaded images. Import keeps a safety snapshot of the previous workspace in its data folder. Keep regular exported backups; do not copy a SQLite database while the app is running.

## Included tools

- Personal dashboard and local crew-name directory
- Gear inventory, grid/list views, reservations/cart, collection and returns, booking administration, history, printable QR/barcode labels and scanning
- Shoot/setup planner with the existing gear presets, adapters, wired/wireless connections, photo toggle, PDF/image/data exports and parts lists
- Clip progress tracker, local crew/editing assignments and deadlines
- Training library, completion records and required training
- Equipment notes, fault photos and service/unavailable status

All local users have management rights. “Working as” changes the local person used for assignments, training and borrowing records; it is not authentication. This is a single-Mac workspace, with no account invitations, live collaboration, Discord integration or synchronization with the hosted site. The service listens on loopback only, not the network.

The starter inventory contains 18 editable equipment entries based on the equipment names/presets already present in the project, with generated placeholder thumbnails and new local asset codes. **Existing live bookings, plans, users, photos and online inventory records have not been copied.** Add your own pictures using local uploads or HTTPS links. Uploaded images work offline; external images, tutorial links and videos still need the internet. QR labels link to this local copy; a phone cannot open a Mac's loopback URL.

Times are displayed in America/Vancouver. Local records belong to this workspace and do not reserve the shared server's real inventory.

## Edit and rebuild without Node.js

All editable browser code is in **src/**. All native code is in **Sources/**. Browser dependencies and their licenses are included in **Libraries/**. Prebuilt browser files are in **www/**.

Rebuild the web interface with the included native Apple Silicon esbuild executable:

```sh
./script/build-web.sh
```

Then refresh the browser. No package installation or npm command is needed.

To rebuild the native binaries/app, install Apple's Xcode Command Line Tools (Swift 5.9 or newer), then run:

```sh
./script/build-native.sh
```

To build both and launch the desktop app:

```sh
./script/build_and_run.sh
```

The resulting app is in **dist/**. The native service uses Apple's Network framework and system SQLite; no third-party server runtime is bundled. Binary tools in **bin/** target Apple Silicon. To use another Mac architecture, rebuild the Swift targets and provide the matching native esbuild executable.

## Focused verification

The release build and Node-free browser build were run. The local web version was opened, a shoot plan was created, inventory gear was added, and persistence was checked after reload. The desktop app was launched separately. A local reservation was also saved. This is a focused check, not a full regression or physical scanner/camera test.

See **THIRD-PARTY-PACKAGES.txt** and the licenses in **Libraries/** for browser dependencies.

## Project layout

```text
src/          Editable React UI and local workflows
Sources/      Swift HTTP service, SQLite storage and desktop shell
www/          Ready-to-run browser build and starter thumbnails
Libraries/    Included browser dependencies and their licenses
bin/          Prebuilt Apple Silicon server and native web build tool
script/       Node-free web/native build commands
start.sh      Start the local browser version
Start.command Double-click launcher for Finder
```

## Backups & moving to another Mac

1. On the homepage, select **Export complete backup**.
2. Keep the exported `.gwgbackup.json` file somewhere safe.
3. Start either version on the other Mac and select **Import backup**.

The desktop app and source-folder version have separate databases. Export/import is how you transfer a workspace between them. Import replaces the current workspace and retains a local safety snapshot.

## Troubleshooting

- **Page stops responding after closing Terminal:** run `./start.sh` again. Keep that Terminal window open while using the browser version.
- **Port is already in use:** close the earlier launcher, or start with `GWG_PORT=8767 ./start.sh`.
- **External pictures/tutorials do not load offline:** upload images into the workspace instead. Web links and videos require an internet connection.
- **A phone cannot open a printed QR link:** QR labels point to this Mac's local workspace. Use the scanner inside the app, or enter the readable asset code manually.
- **Intel Mac / Windows / Linux:** the provided binaries target Apple Silicon macOS. This release does not include ready-to-run binaries for other platforms.

## Distribution & credits

Release downloads contain the runnable Mac app and the local web source package. No user database, real booking history, credentials or Discord configuration is shipped. Third-party libraries retain their own licenses, included under `Libraries/`; see `THIRD-PARTY-PACKAGES.txt`.
