const vm = require('vm');
const fs = require('fs');
const path = require('path');
const {EventEmitter} = require('events');

test('benchmark accepts only authenticated bounded valid results and survives bad input', () => {
    let handler;
    const writeFileSync = jest.fn();
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../benchmarks/popup-startup-preview.cjs'), 'utf8'), {
        __dirname:path.resolve(__dirname,'../benchmarks'), console:{log(){}}, URL, URLSearchParams,
        require:name=>name==='http'?{createServer:fn=>{handler=fn;return {listen(){}};}}:name==='fs'?{writeFileSync}:name==='crypto'?{randomBytes:()=>({toString:()=> 'test-token'})}:require(name)
    });
    const send=(headers,body)=>{
        const req=Object.assign(new EventEmitter(),{method:'POST',url:'/results',headers:{host:'127.0.0.1:8766',...headers}});
        const res={writeHead:jest.fn(),end:jest.fn()};handler(req,res);req.emit('data',Buffer.from(body));req.emit('end');return res.writeHead.mock.calls[0][0];
    };
    const auth={origin:'http://127.0.0.1:8766','x-probe-token':'test-token'};
    expect(send({},'{}')).toBe(403);
    expect(send({...auth,origin:'https://attacker.example'},'{}')).toBe(403);
    expect(send(auth,'x'.repeat(1024*1024+1))).toBe(413);
    expect(send(auth,'not json')).toBe(400);
    expect(send(auth,'[]')).toBe(400);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(send(auth,JSON.stringify({marks:[],requests:[]}))).toBe(200);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
});
