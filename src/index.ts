import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ----------------------------- Utils & Services ---------------------------- */

const readJSON = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const ensureDir = (p: string) => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

class ArabicService {
    static surahs: null | Array<{ id: number; arabicLong: string }> = null;

    static latinToArabicNumbers(input: string | number) {
        const arab = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
        return input
            .toString()
            .split("")
            .map((c) => (/\d/.test(c) ? arab[parseInt(c, 10)] : c))
            .join("");
    }

    static async getSurahName(surahNumber: number) {
        if (!ArabicService.surahs) {
            ArabicService.surahs = readJSON(path.join(__dirname, "data", "surahs.json"));
        }
        return ArabicService.surahs!.find((s) => s.id === surahNumber)?.arabicLong || "";
    }
}

class QPCFontProvider {
    static qpc2Glyphs: Record<string, string> | null = null;
    static qpc1Glyphs: Record<string, string> | null = null;
    static verseMappingV2: any = null; // réservé si besoin plus tard
    static verseMappingV1: any = null;

    static async loadQPCData() {
        const staticPath = path.join(__dirname, "data");
        try {
            const qpc2Path = path.join(staticPath, "QPC2", "qpc-v2.json");
            if (!QPCFontProvider.qpc2Glyphs && fs.existsSync(qpc2Path)) {
                QPCFontProvider.qpc2Glyphs = readJSON(qpc2Path);
            }
            const qpc1Path = path.join(staticPath, "QPC1", "qpc-v1.json");
            if (!QPCFontProvider.qpc1Glyphs && fs.existsSync(qpc1Path)) {
                QPCFontProvider.qpc1Glyphs = readJSON(qpc1Path);
            }
            const mappingV2Path = path.join(staticPath, "QPC2", "verse-mapping.json");
            if (!QPCFontProvider.verseMappingV2 && fs.existsSync(mappingV2Path)) {
                QPCFontProvider.verseMappingV2 = readJSON(mappingV2Path);
            }
            const mappingV1Path = path.join(staticPath, "QPC1", "verse-mapping.json");
            if (!QPCFontProvider.verseMappingV1 && fs.existsSync(mappingV1Path)) {
                QPCFontProvider.verseMappingV1 = readJSON(mappingV1Path);
            }
        } catch (e: any) {
            console.warn("Impossible de charger les données QPC:", e.message);
        }
    }

    static getWordGlyph(surah: number, verse: number, wordPosition: number, version: "1" | "2") {
        const key = `${surah}:${verse}:${wordPosition}`;
        if (version === "1") return QPCFontProvider.qpc1Glyphs?.[key] || "";
        return QPCFontProvider.qpc2Glyphs?.[key] || "";
    }

    static getBasmalaGlyph(version: "1" | "2") {
        return version === "1" ? '#"!' : "ﭑﭒﭓ";
    }

    static getBasmalaFont(version: "1" | "2") {
        return version === "1" ? "QPC1BSML" : "QPC2BSML";
    }
}

/* ------------------------------- Build helpers ------------------------------ */

type WordItem = {
    type: "word";
    location: string; // "s:v:w"
    word: string; // plain Arabic word (with stop marks if present)
    qpcV2: string;
    qpcV1: string;
    surah: number;
    verse: number;
    position: number;
    isVerseEnd?: boolean; // last word of a verse (after merging verse number glyphs)
};

type NonTextItem = { type: "surah-header"; text: string; surah: string } | { type: "basmala"; qpcV2: string; qpcV1: string };

type LineBucket = Array<WordItem> | Array<NonTextItem>;

/** Ajoute une ligne "surah-header" */
async function addSurahHeader(lines: LineBucket[], lineOffsetRef: { value: number }, surahNumber: number) {
    const name = await ArabicService.getSurahName(surahNumber);
    lines.push([{ type: "surah-header", text: name, surah: surahNumber.toString().padStart(3, "0") }]);
    lineOffsetRef.value++;
}

/** Ajoute une ligne "basmala" */
function addBasmala(lines: LineBucket[], lineOffsetRef: { value: number }) {
    lines.push([{ type: "basmala", qpcV2: QPCFontProvider.getBasmalaGlyph("2"), qpcV1: QPCFontProvider.getBasmalaGlyph("1") }]);
    lineOffsetRef.value++;
}

/** Construit un objet "text" final à partir d’un tableau de WordItem */
function buildTextLinePayload(words: WordItem[]) {
    if (!words.length) return null;

    // Le "word" du dernier mot contient déjà le numéro si fin de verset
    const text = words
        .map((w) => w.word)
        .join(" ")
        .trim();

    const start = words[0]!;
    const end = words[words.length - 1]!;
    const verseRange = `${start.surah}:${start.verse}-${end.surah}:${end.verse}`;

    return {
        type: "text" as const,
        text,
        verseRange,
        words: words.map((w) => ({
            location: w.location,
            word: w.word,
            qpcV2: w.qpcV2,
            qpcV1: w.qpcV1,
        })),
    };
}

/* ---------------------------- Core line generation --------------------------- */

async function generateLines(pageData: any, page: number) {
    let lines: LineBucket[] = [];
    let currentSurahNumber: number | null = null;
    const lineOffset = { value: 0 };

    // IMPORTANT: boucle synchrone (pas de forEach(async ...))
    for (const verse of pageData.verses as Array<any>) {
        const verseSurahNumber = verse.surahNumber as number;

        // Changement de sourate -> header + (basmala sauf sourate 9)
        if (currentSurahNumber !== null && currentSurahNumber !== verseSurahNumber) {
            await addSurahHeader(lines, lineOffset, verseSurahNumber);
            if (verseSurahNumber !== 9) addBasmala(lines, lineOffset);
        }
        currentSurahNumber = verseSurahNumber;

        // Copie locale des mots du verset
        const verseWords: Array<any> = [...verse.words];

        // Fusion: ajoute le glyphe du numéro de verset (dernier "mot" QPC) au dernier mot textuel
        // puis supprime l'élément "numéro de verset" de V2. On append aussi le glyphe V1 correspondant.
        if (verseWords.length > 1) {
            const lastIdx = verseWords.length - 1;
            const prevIdx = lastIdx - 1;

            // V2: ajoute le glyph du numéro (contenu dans le dernier élément V2)
            if (verseWords[prevIdx]?.qpc && verseWords[lastIdx]?.qpc) {
                verseWords[prevIdx].qpc = `${verseWords[prevIdx].qpc} ${verseWords[lastIdx].qpc}`.trim();
            }
            // V1: récupère le glyph du numéro via mapping (position endWord + 2)
            const endWordPos = verseWords[prevIdx]?.position as number;
            const verseEndGlyphV1 = QPCFontProvider.getWordGlyph(verseSurahNumber, verse.verseNumber, endWordPos + 2, "1");

            // On marquera ce mot comme "fin de verset" pour injecter le chiffre arabe dans `text`
            verseWords[prevIdx].__appendV1 = verseEndGlyphV1;
            verseWords[prevIdx].__isVerseEnd = true;

            // Supprime le dernier "mot" (numéro de verset) de la liste
            verseWords.pop();
        }

        // Déversement des mots dans leurs lignes cibles
        for (const w of verseWords) {
            const targetLineIndex = (w.line as number) + lineOffset.value;

            // Assure la taille
            while (lines.length <= targetLineIndex) lines.push([]);

            // Si la ligne n’est pas un tableau de WordItem (i.e. déjà un header/basmala), on pousse une nouvelle ligne texte
            if (Array.isArray(lines[targetLineIndex]) && (lines[targetLineIndex] as any[])[0]?.type !== "word" && (lines[targetLineIndex] as any[])[0]?.type !== undefined) {
                // La ligne existante est un header/basmala -> on pousse une nouvelle ligne après
                lines.splice(targetLineIndex + 1, 0, []);
            }

            const qpcV1Glyph = QPCFontProvider.getWordGlyph(verseSurahNumber, verse.verseNumber, w.position as number, "1");
            const finalQpcV1 = (qpcV1Glyph || "") + (w.__appendV1 ? ` ${w.__appendV1}` : "");

            const wordWithVerseNum = w.__isVerseEnd ? `${w.text} ${ArabicService.latinToArabicNumbers(verse.verseNumber)}` : w.text;

            const wordItem: WordItem = {
                type: "word",
                location: w.location,
                word: wordWithVerseNum,
                qpcV2: w.qpc,
                qpcV1: finalQpcV1.trim(),
                surah: verseSurahNumber,
                verse: verse.verseNumber,
                position: w.position,
                isVerseEnd: Boolean(w.__isVerseEnd),
            };

            (lines[targetLineIndex] as Array<WordItem>).push(wordItem);
        }
    }

    // Filtre les lignes vides
    lines = lines.filter((line) => line.length > 0);

    // Ajustements heuristiques (pages initiales / transitions) pour coller au mushaf standard
    if (lines.length === 13) {
        const firstVerse = pageData.verses[0];
        if (firstVerse.verseNumber === 1) {
            // Début de sourate: ajoute header + basmala au début
            lines.unshift([{ type: "basmala", qpcV2: QPCFontProvider.getBasmalaGlyph("2"), qpcV1: QPCFontProvider.getBasmalaGlyph("1") }]);
            const name = await ArabicService.getSurahName(firstVerse.surahNumber);
            lines.unshift([{ type: "surah-header", text: name, surah: firstVerse.surahNumber.toString().padStart(3, "0") }]);
        } else {
            // Fin de page qui annonce la sourate suivante
            const lastVerse = pageData.verses[pageData.verses.length - 1];
            const nextSurah = lastVerse.surahNumber + 1;
            const name = await ArabicService.getSurahName(nextSurah);
            lines.push([{ type: "surah-header", text: name, surah: nextSurah.toString().padStart(3, "0") }]);
            // Basmala pour la prochaine sourate (sauf 9, mais on garde la logique existante)
            if (nextSurah !== 9) {
                lines.push([{ type: "basmala", qpcV2: QPCFontProvider.getBasmalaGlyph("2"), qpcV1: QPCFontProvider.getBasmalaGlyph("1") }]);
            }
        }
    } else if (lines.length === 14) {
        const firstVerse = pageData.verses[0];
        if (firstVerse.verseNumber === 1 && firstVerse.surahNumber !== 9) {
            lines.unshift([{ type: "basmala", qpcV2: QPCFontProvider.getBasmalaGlyph("2"), qpcV1: QPCFontProvider.getBasmalaGlyph("1") }]);
        } else if (firstVerse.surahNumber === 9) {
            const name = await ArabicService.getSurahName(firstVerse.surahNumber);
            lines.unshift([{ type: "surah-header", text: name, surah: firstVerse.surahNumber.toString().padStart(3, "0") }]);
        } else {
            const lastVerse = pageData.verses[pageData.verses.length - 1];
            const name = await ArabicService.getSurahName(lastVerse.surahNumber);
            lines.push([{ type: "surah-header", text: name, surah: lastVerse.surahNumber.toString().padStart(3, "0") }]);
        }
    }

    if (lines.length === 6 || lines.length === 7) {
        // Pages 1-2 (mushaf madani standard)
        if (page === 2) {
            lines.unshift([{ type: "basmala", qpcV2: QPCFontProvider.getBasmalaGlyph("2"), qpcV1: QPCFontProvider.getBasmalaGlyph("1") }]);
        }
        const name = await ArabicService.getSurahName(pageData.verses[0].surahNumber);
        lines.unshift([{ type: "surah-header", text: name, surah: pageData.verses[0].surahNumber.toString().padStart(3, "0") }]);
    }

    // Transformation finale: chaque ligne devient un tableau avec UN objet :
    // - surah-header | basmala => on rajoute "line"
    // - texte => on compacte les WordItem en un seul payload { type:"text", text, verseRange, words }
    const finalLines = lines
        .map((bucket, idx) => {
            const lineNumber = idx + 1;
            const first = (bucket as any[])[0];

            // surah-header / basmala
            if (first?.type === "surah-header" || first?.type === "basmala") {
                return { line: lineNumber, ...(first as NonTextItem) };
            }

            // text
            const payload = buildTextLinePayload(bucket as WordItem[]);
            if (!payload) return null;

            return { line: lineNumber, ...payload };
        })
        .filter(Boolean) as any[];

    return finalLines;
}

/* ------------------------------- Main generator ------------------------------ */

async function generateAllPages() {
    const mushafLayoutPath = path.join(__dirname, "data", "mushaf-layout");
    const outputPath = path.join(__dirname, "..", "mushaf");

    console.log("Démarrage…");
    console.log("Source :", mushafLayoutPath);
    console.log("Sortie :", outputPath);

    await QPCFontProvider.loadQPCData();
    ensureDir(outputPath);

    let ok = 0,
        ko = 0;

    for (let page = 1; page <= 604; page++) {
        try {
            const inputFile = path.join(mushafLayoutPath, `page-${page}.json`);
            const outputFile = path.join(outputPath, `page-${String(page).padStart(3, "0")}.json`);

            if (!fs.existsSync(inputFile)) {
                console.warn(`⚠️  Fichier manquant: page-${page}.json`);
                ko++;
                continue;
            }

            const pageData = readJSON(inputFile);
            const lines = await generateLines(pageData, page);

            const result = { page, lines };
            fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

            ok++;
            if (page % 50 === 0 || page <= 10 || page > 594) {
                console.log(`✅ Page ${page}/604 traitée`);
            }
        } catch (e: any) {
            console.error(`❌ Erreur page ${page}:`, e.message);
            ko++;
        }
    }

    console.log("\n🎉 Terminé !");
    console.log(`✅ Succès: ${ok}`);
    console.log(`❌ Erreurs: ${ko}`);
    console.log(`📁 Sortie: ${outputPath}`);
}

/* --------------------------------- Exports ---------------------------------- */

generateAllPages().catch(console.error);
export { generateLines, ArabicService, QPCFontProvider };
