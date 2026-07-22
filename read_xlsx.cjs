
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const files = fs.readdirSync("scripts");
const found = files.find(f => f.includes("1095") && f.endsWith(".xlsx"));
const filePath = path.join("scripts", found);
console.log("Loading file:", filePath);

const wb = xlsx.readFile(filePath);
console.log("Sheets:", wb.SheetNames);

const activeSheetName = wb.SheetNames[0];
const sheet = wb.Sheets[activeSheetName];
console.log("Active sheet name:", activeSheetName);

const range = xlsx.utils.decode_range(sheet["!ref"]);
console.log("Range:", sheet["!ref"]);

for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
  const rowCells = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddress = xlsx.utils.encode_cell({r: r, c: c});
    const cell = sheet[cellAddress];
    rowCells.push(cell ? cell.v : null);
  }
  console.log("Row " + (r + 1) + ":", rowCells);
}

