import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

const API_URL = "https://api.quran.com/api/v4";

/**
 * Récupère une réponse JSON avec trois tentatives en cas d'erreur temporaire.
 * @param {string} endpoint Chemin et paramètres de la requête Quran.com.
 * @returns {Promise<object>} Réponse JSON de l'API.
 */
async function fetchJSON(endpoint) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(`${API_URL}/${endpoint}`, { signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(`HTTP ${response.status} : ${endpoint}`);
            return await response.json();
        } catch (error) {
            if (attempt === 3) throw error;
            await setTimeout(attempt * 1000);
        }
    }
}

/**
 * Construit les pages avec la pagination, les lignes et les glyphes de l'édition choisie.
 * @param {Map<number, object[]>} pageVerses Versets de chaque page demandée à l'API.
 * @param {object[]} chapters Métadonnées des sourates renvoyées par l'API.
 * @param {1 | 2} version Édition QPC à générer.
 * @returns {Map<number, {page: number, lines: object[]}>} Pages complètes et validées.
 */
export function buildPages(pageVerses, chapters, version) {
    if (version !== 1 && version !== 2) throw new Error(`Version QPC invalide : ${version}`);
    const glyphField = `qpcV${version}`;
    const codeField = `code_v${version}`;
    const pageField = `v${version}_page`;
    const lineField = `line_v${version}`;
    const pages = new Map();
    const verseKeys = new Set();
    for (let page = 1; page <= 604; page++) pages.set(page, { page, lines: [] });

    for (const [page, verses] of pageVerses) {
        if (!pages.has(page) || !verses.length) throw new Error(`Page invalide : ${page}`);
        for (const verse of verses) {
            const [surah, ayah] = verse.verse_key.split(":").map(Number);
            if (verseKeys.has(verse.verse_key)) throw new Error(`Verset dupliqué : ${verse.verse_key}`);
            verseKeys.add(verse.verse_key);

            const chapter = chapters.find((item) => item.id === surah);
            if (!chapter || ayah < 1 || ayah > chapter.verses_count) throw new Error(`Verset invalide : ${verse.verse_key}`);
            if (!verse.words?.length || verse.words.at(-1).char_type_name !== "end") {
                throw new Error(`Fin de verset absente : ${verse.verse_key}`);
            }

            if (ayah === 1) {
                const firstLine = verse.words[0][lineField];
                const decorations = [{ type: "surah-header", text: `سورة ${chapter.name_arabic}`, surah: String(surah).padStart(3, "0") }];
                if (chapter.bismillah_pre) decorations.push({ type: "basmala", [glyphField]: version === 1 ? '#"!' : "ﭑﭒﭓ" });
                for (let index = 0; index < decorations.length; index++) {
                    let line = firstLine - decorations.length + index;
                    let headerPage = verse.words[0][pageField];
                    // L'en-tête peut être imprimé à la fin de la page précédente.
                    if (line <= 0) { headerPage--; line += 15; }
                    const target = pages.get(headerPage);
                    if (!target || target.lines[line - 1]) throw new Error(`En-tête en conflit : page ${headerPage}, ligne ${line}`);
                    target.lines[line - 1] = { line, ...decorations[index] };
                }
            }

            let previousWord;
            let previousLine;
            let previousPage;
            for (const [index, word] of verse.words.entries()) {
                const wordPage = word[pageField];
                const wordLine = word[lineField];
                if (word.position !== index + 1 || !pages.has(wordPage) || !Number.isInteger(wordLine)
                    || wordLine < 1 || wordLine > 15 || !word.text_uthmani || !word[codeField]) {
                    throw new Error(`Mot incomplet ou mal positionné : ${verse.verse_key}:${word.position}`);
                }

                if (word.char_type_name === "end") {
                    const number = String(ayah).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
                    if (index !== verse.words.length - 1 || !previousWord || word.text_uthmani !== number) {
                        throw new Error(`Marqueur de fin invalide : ${verse.verse_key}`);
                    }
                    if (previousLine === wordLine && previousPage === wordPage) {
                        previousWord.word += ` ${word.text_uthmani}`;
                        previousWord[glyphField] += ` ${word[codeField]}`;
                        continue;
                    }
                    // Un marqueur imprimé sur la ligne suivante conserve sa propre position.
                }
                if (word.char_type_name !== "word" && word.char_type_name !== "end") throw new Error(`Type de mot inconnu : ${word.char_type_name}`);

                // La page demandée peut différer de celle du mot dans l'édition choisie.
                const lines = pages.get(wordPage).lines;
                const line = lines[wordLine - 1] ??= { line: wordLine, type: "text", text: "", verseRange: "", words: [] };
                if (line.type !== "text") throw new Error(`Ligne en conflit : page ${wordPage}, ligne ${wordLine}`);
                previousWord = {
                    location: `${verse.verse_key}:${word.position}`,
                    word: word.text_uthmani,
                    [glyphField]: word[codeField],
                };
                previousLine = wordLine;
                previousPage = wordPage;
                line.words.push(previousWord);
            }

            const actual = verse.words.map((word) => word[codeField]).join("").replace(/\s/g, "");
            const expected = verse[codeField]?.replace(/\s/g, "");
            if (!expected || actual !== expected) throw new Error(`Glyphes v${version} incohérents : ${verse.verse_key}`);
        }
    }

    if (chapters.length !== 114 || verseKeys.size !== 6236) throw new Error(`Coran incomplet : ${verseKeys.size} versets`);
    for (const chapter of chapters) {
        for (let ayah = 1; ayah <= chapter.verses_count; ayah++) {
            if (!verseKeys.has(`${chapter.id}:${ayah}`)) throw new Error(`Verset manquant : ${chapter.id}:${ayah}`);
        }
    }
    for (const { page, lines } of pages.values()) {
        const lineCount = page <= 2 ? 8 : 15;
        if (lines.length !== lineCount || Array.from({ length: lineCount }, (_, index) => !lines[index]).some(Boolean)) {
            throw new Error(`Lignes manquantes : page ${page}`);
        }
        for (const line of lines) {
            if (line.type !== "text") continue;
            line.text = line.words.map((word) => word.word).join(" ");
            const firstVerse = line.words[0].location.split(":").slice(0, 2).join(":");
            const lastVerse = line.words.at(-1).location.split(":").slice(0, 2).join(":");
            line.verseRange = `${firstVerse}-${lastVerse}`;
        }
    }
    return pages;
}

/**
 * Télécharge le Coran et écrit les deux ensembles de 604 pages après validation.
 * @returns {Promise<void>} Résolution après l'écriture de toutes les pages.
 */
async function main() {
    const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL("../mushaf/", import.meta.url));
    const { chapters } = await fetchJSON("chapters");
    const pageVerses = new Map();
    for (let page = 1; page <= 604; page++) {
        const verses = [];
        let nextPage = 1;
        do {
            const params = new URLSearchParams({
                mushaf: "1", words: "true", per_page: "50", page: String(nextPage),
                word_fields: "text_uthmani,code_v1,code_v2,v1_page,v2_page,line_v1,line_v2",
                fields: "code_v1,code_v2",
            });
            const response = await fetchJSON(`verses/by_page/${page}?${params}`);
            if (!Array.isArray(response.verses) || !response.verses.length) throw new Error(`Réponse vide : page ${page}`);
            verses.push(...response.verses);
            nextPage = response.pagination?.next_page;
        } while (nextPage);
        pageVerses.set(page, verses);
        if (page % 25 === 0 || page === 604) console.log(`Pages téléchargées : ${page}/604`);
    }

    const datasets = [1, 2].map((version) => ({ version, pages: buildPages(pageVerses, chapters, version) }));
    for (const { version, pages } of datasets) {
        const versionPath = path.join(outputPath, `QPC${version}`);
        await fs.mkdir(versionPath, { recursive: true });
        for (const [page, payload] of pages) {
            await fs.writeFile(path.join(versionPath, `page-${String(page).padStart(3, "0")}.json`), JSON.stringify(payload, null, 2), "utf8");
        }
    }
    // Retire les anciennes pages mixtes seulement après l'écriture des deux éditions.
    for (let page = 1; page <= 604; page++) {
        await fs.rm(path.join(outputPath, `page-${String(page).padStart(3, "0")}.json`), { force: true });
    }
    console.log(`QPC V1 et V2 : 604 pages et 6 236 versets validés par édition. Sortie : ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
