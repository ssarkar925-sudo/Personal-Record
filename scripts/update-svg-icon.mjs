import fs from 'node:fs';
import path from 'node:path';

const pngPath = path.resolve('public/icon-512.png');
const svgPath = path.resolve('public/icon.svg');

const imgBuffer = fs.readFileSync(pngPath);
const b64 = imgBuffer.toString('base64');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" rx="96" fill="#FFFFFF"/>
  <image href="data:image/png;base64,${b64}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;

fs.writeFileSync(svgPath, svgContent, 'utf-8');
console.log('Successfully updated public/icon.svg with Sarkar Communication logo!');
