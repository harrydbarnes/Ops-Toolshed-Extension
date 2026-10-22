(function(){
    'use strict';
    window.reccieStatus={render(status,value,active=false){
        status.classList.toggle('reccie-status-active',active);
        if(!active){status.textContent=value;return;}
        value=value.replace(/(?:\.{1,3}|…)$/,'');
        const span=(text,className)=>{const el=document.createElement('span');el.textContent=text;el.className=className;return el;};
        const dot=span('','reccie-status-dot');dot.setAttribute('aria-hidden','true');
        const split=value.lastIndexOf(' '),body=span(value.slice(0,split+1),'reccie-status-text'),tail=span(value.slice(split+1),'reccie-status-tail');
        const dots=span('','reccie-status-dots');dots.setAttribute('aria-hidden','true');
        for(let index=0;index<3;index++)dots.append(span('.',''));
        tail.append(dots);body.append(tail);status.replaceChildren(dot,body);
    }};
})();
