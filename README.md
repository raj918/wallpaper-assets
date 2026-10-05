# 🖼️ Wallpaper Assets Studio & GitHub Automation

A fast, automated wallpaper backend and modern Admin Panel studio tailored specifically for **wallpaper-assets**, powered by **GitHub** and the **jsDelivr Global CDN**.

---

## ⚡ Quick Start: Running the Admin Panel

### 1. Start the Server
Open terminal in this directory (`wallpaper-assets`) and run:
```bash
npm start
```
*(Or `node server.js`)*

### 2. Open in Browser
Visit: **[http://localhost:3000](http://localhost:3000)**

---

## 📂 Storage & Directory Architecture

This backend adheres strictly to the existing **wallpaper-assets** structure:

```text
wallpaper-assets/
├── server.js                      # Express backend & Sharp automation pipeline
├── package.json                   # Dependencies (express, sharp, multer, cors)
├── config.json                    # CDN URL & Git push configuration
│
├── public/
│   └── index.html                 # Dark Studio Admin Panel UI (Drag-and-Drop & Covers)
│
├── data/
│   ├── categories.json            # Ordered category list, counts, & cover thumbnails
│   ├── category_covers.json       # Persisted category cover mapping
│   ├── wallpapers.json            # Master JSON array for apps & CDN
│   └── version.json               # Auto-incrementing version metadata
│
└── images/                        # Master Wallpapers Storage
    ├── abstract/                  # 1. Full original wallpaper
    │   ├── abstract_1.jpg
    │   └── _uhdabstract1000.jpg
    ├── abstract_thumb/            # 2. Crisp 520px retina thumbnail
    │   ├── abstract_1.jpg
    │   └── _uhdabstract1000.jpg
    │
    ├── nature/
    ├── nature_thumb/
    ├── cars/
    ├── cars_thumb/
    ├── Anime/
    ├── Anime_thumb/
    └── ...
```

---

## 🚀 Key Features & Automation

- **Drag-and-Drop Category Reordering (Custom Index Sequences)**:
  - Drag and drop category cards directly on the overview grid, or use the **"Rearrange Order"** modal.
  - Set direct index numbers (`#1`, `#2`...) or nudge with Move Up / Move Down buttons.
  - Generates `data/categories.json` for client apps to consume categories in the exact desired sequence!
- **Category Cover Thumbnail Selection**:
  - Assign any wallpaper inside a category as its designated cover thumbnail (click the ⭐ star icon).
  - Selected covers are highlighted with a `⭐ COVER` badge and saved to `data/category_covers.json` and `data/categories.json`.
- **Drag-and-Drop Wallpaper Indexing**:
  - Reorder wallpapers inside a category by dragging tiles with mouse or mobile touch gestures.
  - Built-in viewport auto-scroll engine when dragging near screen edges.
  - Automatically re-sequences wallpaper filenames (`prefix_1.ext`, `prefix_2.ext`...) and preserves cover tracking.
- **1 Full + 1 Thumbnail Automation**:
  - Uploading any image saves the **100% untouched original full resolution image** into `images/<category>/`.
  - Automatically generates a **crisp 520px retina thumbnail** with Sharp (quality 88, 4:4:4 color preservation) into `images/<category>_thumb/`.
- **Automatic Master Catalog Updates**:
  - Automatically regenerates `data/wallpapers.json`, `data/categories.json`, and bumps `data/version.json`.
- **Dedicated App Integration Endpoints**:
  - Direct root access: `/categories.json`, `/wallpapers.json`, `/version.json`.
  - See [APP_FETCHING_GUIDE.txt](file:///c:/Users/raj/Desktop/backnedvexawall/APP_FETCHING_GUIDE.txt) for ready-to-use React Native, Flutter, and JS snippets!
- **No Cloudflare Required (100% GitHub & jsDelivr)**:
  - Zero external cloud services or S3 buckets needed.
  - Changes are pushed directly to GitHub (`origin main`).
  - Served worldwide through jsDelivr's super-fast multi-CDN network.
- **1-Click Push to GitHub**:
  - Click **"Push to GitHub"** in the top header to stage, commit, and push changes in 1 second.
  - Or toggle **"Auto Git Commit & Push"** in Settings to automatically push on every upload or deletion.
- **Bulk Upload & Smart Renaming**:
  - Drag and drop up to 500 images at once.
  - Supports smart sequential renaming (e.g. `nature_1.jpg`, `nature_2.jpg`) or keeping original filenames.
- **Batch Management**:
  - Multi-select checkboxes to delete multiple wallpapers in one action.
  - Deleting an image cleanly deletes both the full file and its thumbnail.
- **1-Click Rebuild Thumbs**:
  - One click will batch-regenerate all thumbnails across every category.
- **Inspector Lightbox**:
  - Click any card to preview full size, inspect file details, and copy live CDN URLs with 1 click.
