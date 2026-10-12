// Explicit build-time import; the shipped app never downloads an encoder.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const pkg=JSON.parse(await fs.readFile(new URL('node_modules/qrcode-generator/package.json',root),'utf8'));
if(pkg.name!=='qrcode-generator'||pkg.version!=='2.0.4'||pkg.license!=='MIT')throw Error('Expected qrcode-generator 2.0.4 (MIT). Run npm ci.');
const bytes=await fs.readFile(new URL('node_modules/qrcode-generator/dist/qrcode.mjs',root));
const license=`qrcode-generator 2.0.4\nhttps://github.com/kazuhikoarase/qrcode-generator\n\nCopyright (c) 2009 Kazuhiko Arase\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.\n`;
const files=[['src/qr-code.mjs',bytes],['assets/QR_CODE_LICENSE.txt',Buffer.from(license)]];
for(const [file,data] of files)await fs.writeFile(new URL(file,root),data);
await fs.writeFile(new URL('assets/qr-code.json',root),JSON.stringify({package:pkg.name,version:pkg.version,license:pkg.license,files:files.map(([file,data])=>({file,sha256:createHash('sha256').update(data).digest('hex')}))},null,2)+'\n');
console.log('Vendored qrcode-generator 2.0.4 with MIT notice.');
