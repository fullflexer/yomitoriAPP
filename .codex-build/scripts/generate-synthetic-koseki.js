import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GOLD_STANDARD_DIR, listGoldFixtureBaseNames, loadGoldFixture, } from "./ocr-bench-shared.js";
const PAGE_WIDTH = 2200;
const PAGE_PADDING_X = 80;
const TITLE_TOP = 70;
const BANNER_TOP = 150;
const TABLE_TOP = 310;
const ROW_HEIGHT = 92;
const EVENT_FONT_SIZE = 24;
const FONT_FAMILY = '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
const GRID_COLOR = "#2b2b2b";
const HEADER_FILL = "#f3f3ef";
async function main() {
    const targets = parseTargets(process.argv.slice(2));
    for (const baseName of targets) {
        const fixture = loadGoldFixture(baseName);
        await renderFixture(baseName, fixture);
        console.log(`generated,${baseName},${path.join(GOLD_STANDARD_DIR, `${baseName}.png`)}`);
    }
}
function parseTargets(args) {
    if (args.length === 0) {
        return listGoldFixtureBaseNames();
    }
    return args.map((arg) => arg.replace(/\.json$|\.png$/g, ""));
}
async function renderFixture(baseName, fixture) {
    const outputPath = path.join(GOLD_STANDARD_DIR, `${baseName}.png`);
    const layout = buildLayout(baseName, fixture);
    const canvasModule = await loadCanvasModule();
    mkdirSync(path.dirname(outputPath), { recursive: true });
    if (canvasModule) {
        const canvas = canvasModule.createCanvas(layout.width, layout.height);
        const context = canvas.getContext("2d");
        drawWithCanvas(context, layout.commands);
        writeFileSync(outputPath, canvas.toBuffer("image/png"));
        return;
    }
    const sharp = await loadSharpRenderer();
    const svg = renderSvg(layout.width, layout.height, layout.commands);
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
}
function buildLayout(baseName, fixture) {
    const peopleCount = fixture.persons.length;
    const tableHeight = (peopleCount + 1) * ROW_HEIGHT;
    const footerTop = TABLE_TOP + tableHeight + 40;
    const height = footerTop + 70;
    const commands = [
        {
            type: "rect",
            x: 0,
            y: 0,
            width: PAGE_WIDTH,
            height,
            fill: "#ffffff",
        },
        {
            type: "text",
            x: PAGE_PADDING_X,
            y: TITLE_TOP,
            text: "平成6年式 コンピュータ化戸籍（合成 OCR ベンチマーク用）",
            fontSize: 38,
            fontWeight: "bold",
        },
        {
            type: "text",
            x: PAGE_WIDTH - 380,
            y: TITLE_TOP + 6,
            text: `帳票ID ${baseName}`,
            fontSize: 24,
        },
        {
            type: "rect",
            x: PAGE_PADDING_X,
            y: BANNER_TOP,
            width: PAGE_WIDTH - PAGE_PADDING_X * 2,
            height: 120,
            fill: "#faf7ef",
            stroke: GRID_COLOR,
            strokeWidth: 2,
        },
        {
            type: "text",
            x: PAGE_PADDING_X + 24,
            y: BANNER_TOP + 24,
            text: `筆頭者: ${fixture.headOfHousehold.value}`,
            fontSize: 28,
            fontWeight: "bold",
        },
        {
            type: "text",
            x: PAGE_PADDING_X + 24,
            y: BANNER_TOP + 66,
            text: `本籍: ${fixture.registeredAddress.value}`,
            fontSize: 26,
        },
    ];
    const columns = [
        { label: "続柄", width: 170 },
        { label: "氏名", width: 220 },
        { label: "生年月日", width: 220 },
        { label: "死亡日", width: 220 },
        { label: "性別", width: 90 },
        { label: "住所", width: 520 },
        { label: "身分事項", width: 520 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const tableLeft = PAGE_PADDING_X;
    commands.push({
        type: "rect",
        x: tableLeft,
        y: TABLE_TOP,
        width: tableWidth,
        height: tableHeight,
        stroke: GRID_COLOR,
        strokeWidth: 2,
    }, {
        type: "rect",
        x: tableLeft,
        y: TABLE_TOP,
        width: tableWidth,
        height: ROW_HEIGHT,
        fill: HEADER_FILL,
    });
    let cursorX = tableLeft;
    for (const column of columns) {
        commands.push({
            type: "line",
            x1: cursorX,
            y1: TABLE_TOP,
            x2: cursorX,
            y2: TABLE_TOP + tableHeight,
            stroke: GRID_COLOR,
            strokeWidth: 2,
        }, {
            type: "text",
            x: cursorX + 18,
            y: TABLE_TOP + 28,
            text: column.label,
            fontSize: 24,
            fontWeight: "bold",
        });
        cursorX += column.width;
    }
    commands.push({
        type: "line",
        x1: tableLeft + tableWidth,
        y1: TABLE_TOP,
        x2: tableLeft + tableWidth,
        y2: TABLE_TOP + tableHeight,
        stroke: GRID_COLOR,
        strokeWidth: 2,
    });
    fixture.persons.forEach((person, index) => {
        const rowTop = TABLE_TOP + ROW_HEIGHT * (index + 1);
        const rowBottom = rowTop + ROW_HEIGHT;
        const rowValues = [
            person.relationship?.value ?? "",
            person.name.value,
            person.birthDate.value,
            person.deathDate?.value ?? "",
            person.gender?.value ?? "",
            person.address?.value ?? "",
            summarizeEvents(person),
        ];
        commands.push({
            type: "line",
            x1: tableLeft,
            y1: rowTop,
            x2: tableLeft + tableWidth,
            y2: rowTop,
            stroke: GRID_COLOR,
            strokeWidth: 1.5,
        });
        let valueX = tableLeft;
        rowValues.forEach((value, valueIndex) => {
            const fontSize = valueIndex === rowValues.length - 1 ? EVENT_FONT_SIZE : 25;
            commands.push(...wrapText(value, columns[valueIndex].width - 28, fontSize).map((line, lineIndex) => ({
                type: "text",
                x: valueX + 14,
                y: rowTop + 16 + lineIndex * 28,
                text: line,
                fontSize,
            })));
            valueX += columns[valueIndex].width;
        });
        commands.push({
            type: "line",
            x1: tableLeft,
            y1: rowBottom,
            x2: tableLeft + tableWidth,
            y2: rowBottom,
            stroke: GRID_COLOR,
            strokeWidth: 1,
        });
    });
    commands.push({
        type: "text",
        x: PAGE_PADDING_X,
        y: footerTop,
        text: "注記: 本帳票は OCR 精度ベンチマーク専用の架空データから生成した合成画像である。",
        fontSize: 22,
    });
    return {
        width: PAGE_WIDTH,
        height,
        commands,
    };
}
function summarizeEvents(person) {
    return person.events.map((event) => `${event.date.value} ${event.detail.value}`).join(" / ");
}
function wrapText(text, maxWidth, fontSize) {
    if (!text) {
        return [""];
    }
    const roughCharsPerLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.95)));
    const lines = [];
    let remaining = text;
    while (remaining.length > roughCharsPerLine) {
        lines.push(remaining.slice(0, roughCharsPerLine));
        remaining = remaining.slice(roughCharsPerLine);
    }
    lines.push(remaining);
    return lines.slice(0, 3);
}
function drawWithCanvas(context, commands) {
    context.textBaseline = "top";
    for (const command of commands) {
        if (command.type === "rect") {
            if (command.fill) {
                context.fillStyle = command.fill;
                context.fillRect(command.x, command.y, command.width, command.height);
            }
            if (command.stroke) {
                context.strokeStyle = command.stroke;
                context.lineWidth = command.strokeWidth ?? 1;
                context.strokeRect(command.x, command.y, command.width, command.height);
            }
            continue;
        }
        if (command.type === "line") {
            context.beginPath();
            context.strokeStyle = command.stroke ?? GRID_COLOR;
            context.lineWidth = command.strokeWidth ?? 1;
            context.moveTo(command.x1, command.y1);
            context.lineTo(command.x2, command.y2);
            context.stroke();
            continue;
        }
        context.fillStyle = command.fill ?? "#111111";
        context.font = `${command.fontWeight === "bold" ? "700" : "400"} ${command.fontSize}px ${FONT_FAMILY}`;
        context.fillText(command.text, command.x, command.y);
    }
}
function renderSvg(width, height, commands) {
    const body = commands
        .map((command) => {
        if (command.type === "rect") {
            return `<rect x="${command.x}" y="${command.y}" width="${command.width}" height="${command.height}" fill="${command.fill ?? "none"}" stroke="${command.stroke ?? "none"}" stroke-width="${command.strokeWidth ?? 0}" />`;
        }
        if (command.type === "line") {
            return `<line x1="${command.x1}" y1="${command.y1}" x2="${command.x2}" y2="${command.y2}" stroke="${command.stroke ?? GRID_COLOR}" stroke-width="${command.strokeWidth ?? 1}" />`;
        }
        const fontWeight = command.fontWeight === "bold" ? 700 : 400;
        return `<text x="${command.x}" y="${command.y}" font-size="${command.fontSize}" font-weight="${fontWeight}" fill="${command.fill ?? "#111111"}" font-family=${quoteXmlAttribute(FONT_FAMILY)}>${escapeXml(command.text)}</text>`;
    })
        .join("");
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
async function loadCanvasModule() {
    try {
        return (await import("canvas"));
    }
    catch {
        return null;
    }
}
async function loadSharpRenderer() {
    const pnpmDir = path.join(process.cwd(), "node_modules", ".pnpm");
    const sharpEntry = readdirSync(pnpmDir).find((entry) => entry.startsWith("sharp@"));
    if (!sharpEntry) {
        throw new Error("Neither canvas nor sharp fallback is available to render PNG output.");
    }
    const sharpModulePath = path.join(pnpmDir, sharpEntry, "node_modules", "sharp", "lib", "index.js");
    const sharpModule = (await import(pathToFileURL(sharpModulePath).href));
    const renderer = sharpModule.default;
    if (!renderer) {
        throw new Error(`Failed to load sharp fallback from ${sharpModulePath}`);
    }
    return renderer;
}
function escapeXml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}
function quoteXmlAttribute(value) {
    return `"${escapeXml(value)}"`;
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
