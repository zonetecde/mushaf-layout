# Mushaf Pages (Hafs ʿan ʿĀṣim) – JSON Dataset

The folders `./mushaf/QPC1` and `./mushaf/QPC2` each contain **one JSON file per page** of the corresponding Madani Mushaf edition in the **Hafs ʿan ʿĀṣim** reading.
Each file is named: `page-XXX.json` (zero-padded to 3 digits, e.g. `page-001.json` … `page-604.json`).

Each edition has its own page and line boundaries. QPC1 files contain only
`qpcV1` glyph fields; QPC2 files contain only `qpcV2` glyph fields.

These files let you **render a Mushaf UI without server-side layout logic**: headers, basmala lines, text lines grouped by page, verse ranges, and per-word QPC glyphs are all precomputed.

## Legacy compatibility

The `v2` branch contains the new datasets and fonts. The `main` branch is kept
unchanged for existing consumers of `mushaf/page-XXX.json`, including GitHub Raw
URLs and archives that explicitly target `main`. Its historical files retain
both `qpcV1` and `qpcV2` fields in a shared layout.

To migrate, select `mushaf/QPC1` or `mushaf/QPC2` on `v2` and use the matching
glyph field and fonts. Changes on `v2` should not be merged into `main`, so the
legacy paths remain available.

<p align="center">
  <img src="https://github.com/user-attachments/assets/ed12bbe6-7c01-40e0-8a17-2e92fc4dec10" alt="image 1" width="30%" />
  <img src="https://github.com/user-attachments/assets/0c61f614-1b63-43d5-8e21-280b7dcc1651" alt="image 2" width="30%" />
  <img src="https://github.com/user-attachments/assets/c877657a-8f36-45cd-af40-67b83bce23c1" alt="image 3" width="30%" />
</p>

---

## Refreshing the dataset from Quran.com

Requires Node.js 18 or later. Run `npm run refetch` (or `npm run dev`) to download
the Quran and regenerate both sets of 604 pages. To write to another
folder, run `npm run refetch -- ./mushaf-refetched`.

The script uses Quran.com's explicit `v1_page` / `line_v1` and
`v2_page` / `line_v2` fields and the corresponding glyphs. It merges the explicit
verse-end marker into the last word when they share a line. A marker on the
following line keeps its own word entry. It checks all 6,236 verses in both
editions before writing any page, then removes the old mixed `mushaf/page-XXX.json` files.

This command does not refresh `src/data` or synchronize `mushaf-svelte`.
`src/index.ts` is the historical generator; the npm commands now use `src/fetch-pages.js`.

---

## What’s inside a `page-XXX.json`?

Example from QPC2 (QPC1 uses `qpcV1` instead):

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
            "qpcV2": "ﭑﭒﭓ"
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
                    "qpcV2": "ﱁ ﱂ"
                },
                {
                    "location": "2:2:1",
                    "word": "ذَٰلِكَ",
                    "qpcV2": "ﱃ"
                },
                {
                    "location": "2:2:2",
                    "word": "ٱلْكِتَـٰبُ",
                    "qpcV2": "ﱄ"
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
-   **`basmala`**: Basmala glyphs for the selected edition (`qpcV1` or `qpcV2`).
-   **`text`**: A logical text line with:

    -   `text`: full line text (Arabic), including Arabic verse numbers at verse ends.
    -   `verseRange`: first and last verse covered (e.g. `"2:1-2:2"`).
    -   `words[]`: per-word objects:

        -   `location`: `surah:verse:wordIndex` (1-based).
        -   `word`: the Arabic token. The verse number is appended to the last word when they share a line (e.g. `"ٱلرَّحِيمِ ١"`); otherwise, it has its own entry on the following line.
        -   `qpcV1` or `qpcV2`: pre-mapped glyphs for the file's edition. The other field is absent.

---

## What is this for?

-   Build a **client-side Mushaf renderer** for the **Hafs ʿan ʿĀṣim** reading:

    -   Show Surah headers and Basmala placements (Sūrat at-Tawbah excluded).
    -   Render text lines with exact breakpoints per page.
    -   Display **Arabic verse numbers** at the end of each verse (appended to the last word or kept on the following line).
    -   Choose the **QPC1** or **QPC2** dataset and matching fonts.

You only need to iterate the `lines`, branch by `type`, and render accordingly.

---

## Accessing the files (GitHub Raw)

You can fetch any page directly via GitHub’s raw endpoint:

```
https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/v2/mushaf/QPC1/page-XXX.json
https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/v2/mushaf/QPC2/page-XXX.json
```

-   Replace `XXX` with a **zero-padded** page number (e.g. `page-002.json`).

**Examples**

```bash
# Download QPC2 page 2
curl -L \
  https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/v2/mushaf/QPC2/page-002.json

# In JavaScript
const url = 'https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/v2/mushaf/QPC2/page-002.json';
const page2 = await fetch(url).then(r => r.json());
```

---

## Rendering notes

-   Use an Arabic-capable font + the appropriate **QPC font** (for `qpcV1`/`qpcV2`) if you plan to render glyphs directly.
-   `text` is already the concatenation of `words.word`; you can render either `text` or the `words[]` list (for fine-grained styling, tooltips, click events, etc.).
-   Total pages: **604 per edition** (1,208 files).

---

## Bundled fonts

`fonts/` contains the 1,211 font files used by `mushaf-svelte`, copied unchanged
(approximately 140 MiB):

-   `fonts/QPC1/p001.woff2` through `p604.woff2`: QPC V1 page fonts.
-   `fonts/QPC1/QPC1BSML.ttf`: QPC V1 basmala font.
-   `fonts/QPC2/p001.woff2` through `p604.woff2`: QPC V2 page fonts.
-   `fonts/QPC2/QPC2BSML.ttf`: QPC V2 basmala font.
-   `fonts/Surahs.ttf`: surah-title font, shared by both editions.

For text lines, use the font matching the JSON's edition and `page`, with the page
number padded to three digits. Use the dedicated basmala font for `basmala`
lines, and `Surahs.ttf` with the three-digit `surah` code for `surah-header` lines.
For example, QPC V2 page 2 can load its font with:

```css
@font-face {
    font-family: 'QPC2_p002';
    src: url('./fonts/QPC2/p002.woff2') format('woff2');
}
```

`npm run refetch` refreshes the JSON datasets; it does not modify these fonts.

### Provenance and licensing

The immediate source is the companion repository's `static/QPC1/fonts`,
`static/QPC2/fonts` and `static/fonts/Surahs.ttf`. The QPC basmala files contain
the copyright notice "King Fahad Complex, All rights reserved." and credit
Harf Information Technology. The [Nuqayah QPC font documentation](https://github.com/nuqayah/qpc-fonts)
provides upstream references and links to the
[King Fahd Complex copyright notice](http://dm.qurancomplex.gov.sa/copyright-2/).

`Surahs.ttf` identifies Ahmed Alaa Elgharib as its author and uses the family
name "Elgharib- Surah Name V4". It is a separate font from the QPC families.

All embedded notices are preserved. Complete font redistribution terms are not
bundled with the source files; the upstream copyright page could not be retrieved
when adding these copies. The project's ISC code license does not relicense these
third-party fonts.

---

## Folder structure

```
mushaf/
├── QPC1/
│   ├── page-001.json
│   ├── ...
│   └── page-604.json
└── QPC2/
    ├── page-001.json
    ├── ...
    └── page-604.json

fonts/
├── QPC1/
│   ├── p001.woff2 ... p604.woff2
│   └── QPC1BSML.ttf
├── QPC2/
│   ├── p001.woff2 ... p604.woff2
│   └── QPC2BSML.ttf
└── Surahs.ttf
```

That’s it — drop these files into your app, fetch by page, and render a Mushaf of **Hafs ʿan ʿĀṣim** with minimal logic.
