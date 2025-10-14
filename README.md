# Mushaf Pages (Hafs ʿan ʿĀṣim) – JSON Dataset

This folder (`./mushaf`) contains **one JSON file per page** of a standard Madani Mushaf in the **Hafs ʿan ʿĀṣim** reading.
Each file is named: `page-XXX.json` (zero-padded to 3 digits, e.g. `page-001.json` … `page-604.json`).

These files let you **render a Mushaf UI without server-side layout logic**: headers, basmala lines, text lines grouped by page, verse ranges, and per-word QPC glyphs are all precomputed.

<p align="center">
  <img src="https://github.com/user-attachments/assets/ed12bbe6-7c01-40e0-8a17-2e92fc4dec10" alt="image 1" width="30%" />
  <img src="https://github.com/user-attachments/assets/0c61f614-1b63-43d5-8e21-280b7dcc1651" alt="image 2" width="30%" />
  <img src="https://github.com/user-attachments/assets/c877657a-8f36-45cd-af40-67b83bce23c1" alt="image 3" width="30%" />
</p>

---

## What’s inside a `page-XXX.json`?

```json
{
    "page": 2,
    "lines": [
        {
            "line": 1,
            "type": "surah-header",
            "text": "سورة البقرة",
            "surah": "002"
        },
        {
            "line": 2,
            "type": "basmala",
            "qpcV2": "ﭑﭒﭓ",
            "qpcV1": "#\"!"
        },
        {
            "line": 3,
            "type": "text",
            "text": "الٓمٓ ١ ذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًۭى",
            "verseRange": "2:1-2:2",
            "words": [
                {
                    "location": "2:1:1",
                    "word": "الٓمٓ ١",
                    "qpcV2": "ﱁ ﱂ",
                    "qpcV1": "ﭑ"
                },
                {
                    "location": "2:2:1",
                    "word": "ذَٰلِكَ",
                    "qpcV2": "ﱃ",
                    "qpcV1": "ﭓ"
                },
                {
                    "location": "2:2:2",
                    "word": "ٱلْكِتَـٰبُ",
                    "qpcV2": "ﱄ",
                    "qpcV1": "ﭔ"
                }
                // ...
            ]
        }
        // ...
    ]
}
```

### Line types

-   **`surah-header`**: Arabic Surah title + 3-digit Surah code (`"002"`).
-   **`basmala`**: Basmala glyphs for **QPC2** (`qpcV2`) and **QPC1** (`qpcV1`).
-   **`text`**: A logical text line with:

    -   `text`: full line text (Arabic), including Arabic verse numbers at verse ends.
    -   `verseRange`: first and last verse covered (e.g. `"2:1-2:2"`).
    -   `words[]`: per-word objects:

        -   `location`: `surah:verse:wordIndex` (1-based).
        -   `word`: the Arabic token. **For the last word of each verse, the Arabic verse number is appended** (e.g. `"ٱلرَّحِيمِ ١"`).
        -   `qpcV2` / `qpcV1`: pre-mapped glyphs for QPC2/QPC1 fonts.

---

## What is this for?

-   Build a **client-side Mushaf renderer** for the **Hafs ʿan ʿĀṣim** reading:

    -   Show Surah headers and Basmala placements (Sūrat at-Tawbah excluded).
    -   Render text lines with exact breakpoints per page.
    -   Display **Arabic verse numbers** at the end of each verse (already appended to the last word).
    -   Choose **QPC2** or **QPC1** glyphs depending on your font stack.

You only need to iterate the `lines`, branch by `type`, and render accordingly.

---

## Accessing the files (GitHub Raw)

You can fetch any page directly via GitHub’s raw endpoint:

```
https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-XXX.json
```

-   Replace `XXX` with a **zero-padded** page number (e.g. `page-002.json`).

**Examples**

```bash
# Download page 2
curl -L \
  https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-002.json

# In JavaScript
const url = 'https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-002.json';
const page2 = await fetch(url).then(r => r.json());
```

---

## Rendering notes

-   Use an Arabic-capable font + the appropriate **QPC font** (for `qpcV1`/`qpcV2`) if you plan to render glyphs directly.
-   `text` is already the concatenation of `words.word`; you can render either `text` or the `words[]` list (for fine-grained styling, tooltips, click events, etc.).
-   Total pages: **604**.

---

## Folder structure

```
mushaf/
├── page-001.json
├── page-002.json
├── ...
└── page-604.json
```

That’s it — drop these files into your app, fetch by page, and render a Mushaf of **Hafs ʿan ʿĀṣim** with minimal logic.
