const http=require('http'),fs=require('fs'),path=require('path');const root=__dirname;http.createServer((req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(root,'index.html')))}else{res.writeHead(404);res.end()}}).listen(8879,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8879'));

