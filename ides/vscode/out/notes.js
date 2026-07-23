"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadNote = loadNote;
exports.saveNote = saveNote;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function notesDir(repoRoot) {
    return path.join(repoRoot, ".peer-review", "notes");
}
function sanitize(str) {
    return str.replace(/[^a-zA-Z0-9_\-\.]/g, "_").slice(0, 100);
}
function noteFileForFinding(repoRoot, finding) {
    const filePart = sanitize(path.basename(finding.file));
    const linePart = `L${finding.startLine}`;
    const catPart = sanitize(finding.category);
    const filename = `${filePart}_${linePart}_${catPart}.md`;
    return path.join(notesDir(repoRoot), filename);
}
function loadNote(repoRoot, finding) {
    const filePath = noteFileForFinding(repoRoot, finding);
    try {
        return fs.readFileSync(filePath, "utf-8");
    }
    catch {
        return "";
    }
}
function saveNote(repoRoot, finding, content) {
    const dir = notesDir(repoRoot);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = noteFileForFinding(repoRoot, finding);
    fs.writeFileSync(filePath, content, "utf-8");
}
//# sourceMappingURL=notes.js.map