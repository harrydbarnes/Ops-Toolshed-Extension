const fs=require('fs'),path=require('path');
const {runtimeFiles}=require('../scripts/package-extension.cjs');
const root=path.resolve(__dirname,'..');
test('runtime package retains extension entry points and assets, excluding development and server files',()=>{
 const files=runtimeFiles().map(file=>file.replaceAll('\\','/'));
 for(const file of ['manifest.json','background.js','build-info.js','popup.html','approvers-icons.css','onboarding-tour.html','onboarding-tour-v2.html','assets/fonts/fonts.css','vendor/pdfjs/pdf.worker.min.mjs'])expect(files).toContain(file);
 expect(files.some(file=>/^(tests|docs|outputs|node_modules|integrations|artifacts|scripts|benchmarks)\//.test(file))).toBe(false);
 for(const file of ['package.json','package-lock.json','jest.config.js','babel.config.js','update-build-info.js','icon-backup.png'])expect(files).not.toContain(file);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 expect(manifest.permissions).toContain('activeTab');
 for(const host of ['https://groupmuk-prisma.mediaocean.com/*','https://go.demo.mediaocean.com/*'])expect(manifest.host_permissions).not.toContain(host);
 expect(manifest.host_permissions).toContain('https://*.mediaocean.com/*');
});
test('Approvers icon styles cover initial and dynamically selected states with packaged local resources',()=>{
 const html=fs.readFileSync(path.join(root,'approvers.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'approvers-icons.css'),'utf8');
 expect(html).toContain('href="approvers-icons.css"');expect(html).not.toContain('cdnjs');
 for(const selector of ['.fa-search','.fas.fa-star','.far.fa-star','.fa-chevron-down','.fa-chevron-up','.fa-bullhorn','.fa-file-excel'])expect(css).toContain(selector+' { mask-image:');
 for(const match of css.matchAll(/url\("([^"()]+)"\)/g))expect(fs.readFileSync(path.join(root,match[1]),'utf8')).toContain('<svg');
 expect(JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_security_policy.extension_pages).not.toMatch(/https?:/);
});
