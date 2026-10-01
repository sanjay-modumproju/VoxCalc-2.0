(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const HISTORY = "voxcalc2_history";
  let expr="", last=0, memory=0, angle="DEG", recognition=null, listening=false;

  const toast = msg => { const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove("show"),1700); };
  const fmt = n => { if(!Number.isFinite(n)) throw Error("Result is not finite"); return Number(n.toPrecision(12)).toString(); };
  const fact = n => { if(!Number.isInteger(n)||n<0||n>170) throw Error("Factorial needs an integer from 0 to 170"); let r=1; for(let i=2;i<=n;i++)r*=i; return r; };
  const fn = {
  sin:x=>Math.sin(angle==="DEG"?x*Math.PI/180:x),

  cos:x=>Math.cos(angle==="DEG"?x*Math.PI/180:x),

  tan:x=>Math.tan(angle==="DEG"?x*Math.PI/180:x),

  sec:x=>{
    const r=angle==="DEG"?x*Math.PI/180:x;
    const c=Math.cos(r);
    if(Math.abs(c)<1e-12) throw Error("SEC undefined at this angle");
    return 1/c;
  },

  csc:x=>{
    const r=angle==="DEG"?x*Math.PI/180:x;
    const s=Math.sin(r);
    if(Math.abs(s)<1e-12) throw Error("CSC undefined at this angle");
    return 1/s;
  },

  cot:x=>{
    const r=angle==="DEG"?x*Math.PI/180:x;
    const s=Math.sin(r);
    if(Math.abs(s)<1e-12) throw Error("COT undefined at this angle");
    return Math.cos(r)/s;
  },

  sqrt:x=>{
    if(x<0)throw Error("Square root needs a non-negative value");
    return Math.sqrt(x)
  },

  log:x=>{
    if(x<=0)throw Error("Log needs a positive value");
    return Math.log10(x)
  },

  ln:x=>{
    if(x<=0)throw Error("Natural log needs a positive value");
    return Math.log(x)
  }
};
  const constants={pi:Math.PI,e:Math.E};

  function tokens(s){
    const out=[];let i=0;
    while(i<s.length){
      if(/\s/.test(s[i])){i++;continue}
      if(/[\d.]/.test(s[i])){let st=i,d=0;while(i<s.length&&/[\d.]/.test(s[i])){if(s[i]===".")d++;i++}if(d>1)throw Error("Invalid number");out.push({t:"n",v:Number(s.slice(st,i))});continue}
      if(/[A-Za-z]/.test(s[i])){let st=i;while(i<s.length&&/[A-Za-z]/.test(s[i]))i++;let w=s.slice(st,i).toLowerCase();if(fn[w])out.push({t:"f",v:w});else if(w in constants)out.push({t:"n",v:constants[w]});else throw Error("Unknown function: "+w);continue}
      if("+-*/%^!".includes(s[i])){out.push({t:"o",v:s[i++]});continue}
      if("()".includes(s[i])){out.push({t:s[i],v:s[i++]});continue}
      throw Error("Unexpected character");
    }return out;
  }

  function rpn(ts){
    const out=[],st=[],p={"u-":5,"!":6,"^":4,"*":3,"/":3,"%":3,"+":2,"-":2},right=new Set(["u-","^"]);let prev=null;
    for(const t of ts){
      if(t.t==="n"){out.push(t);prev=t;continue}
      if(t.t==="f"){st.push(t);prev=t;continue}
      if(t.t==="("){st.push(t);prev=t;continue}
      if(t.t===")"){let ok=false;while(st.length){let x=st.pop();if(x.t==="("){ok=true;break}out.push(x)}if(!ok)throw Error("Mismatched parentheses");if(st.at(-1)?.t==="f")out.push(st.pop());prev=t;continue}
      let op=t.v;if(op==="-"&&(!prev||prev.t==="o"||prev.t==="("))op="u-";
      if(op==="!"){out.push({t:"o",v:"!"});prev={t:"o",v:"!"};continue}
      while(st.length&&st.at(-1).t==="o"){let top=st.at(-1).v;if(right.has(op)?p[op]<p[top]:p[op]<=p[top])out.push(st.pop());else break}
      st.push({t:"o",v:op});prev={t:"o",v:op};
    }
    while(st.length){let x=st.pop();if(x.t==="(")throw Error("Mismatched parentheses");out.push(x)}return out;
  }

  function evaluate(s){
    const stack=[];for(const t of rpn(tokens(s))){
      if(t.t==="n")stack.push(t.v);
      else if(t.t==="f"){const a=stack.pop();if(a===undefined)throw Error("Missing function argument");stack.push(fn[t.v](a))}
      else {if(t.v==="u-"){const a=stack.pop();if(a===undefined)throw Error("Invalid expression");stack.push(-a);continue}
        if(t.v==="!"){const a=stack.pop();if(a===undefined)throw Error("Invalid factorial");stack.push(fact(a));continue}
        const b=stack.pop(),a=stack.pop();if(a===undefined||b===undefined)throw Error("Incomplete expression");
        if(t.v==="/"&&b===0)throw Error("Cannot divide by zero");
        stack.push({"+":a+b,"-":a-b,"*":a*b,"/":a/b,"%":a%b,"^":a**b}[t.v]);
      }
    }if(stack.length!==1)throw Error("Incomplete expression");return stack[0];
  }

  function render(){ $("#expression").textContent=expr||"0"; if(!expr)$("#answer").textContent=fmt(last); }
  function add(v){if(expr==="Error")expr="";expr+=v;$("#expression").textContent=expr;$("#heard").textContent="";}
  function clear(){expr="";$("#expression").textContent="0";$("#answer").textContent=fmt(last);$("#heard").textContent="";$("#status").textContent="Ready"}
  function back(){if(expr==="Error")return clear();expr=expr.slice(0,-1);$("#expression").textContent=expr||"0"}

  function stepsFor(s, result){
    const rows=[];
    const cleaned=s;
    const match=cleaned.match(/^(\d+(?:\.\d+)?)\s*([+\-*/%^])\s*(\d+(?:\.\d+)?)$/);
    if(match){
      const [_,a,op,b]=match, symbols={"+":"+","-":"−","*":"×","/":"÷","%":"%","^":"^"};
      rows.push(`Start with ${a} ${symbols[op]} ${b}.`);
      rows.push(`${a} ${symbols[op]} ${b} = ${result}`);
    } else {
      rows.push(`Expression: ${cleaned}`);
      rows.push(`The expression was evaluated using the VoxCalc parser.`);
      rows.push(`Final answer = ${result}`);
    }
    $("#steps").innerHTML=rows.map((x,i)=>`<div class="step"><div class="step-no">${i+1}</div><div>${x}</div></div>`).join("");
  }

  function save(s,a){let h=JSON.parse(localStorage.getItem(HISTORY)||"[]");h.unshift({s,a,t:Date.now()});localStorage.setItem(HISTORY,JSON.stringify(h.slice(0,60)));renderHistory()}
  function renderHistory(){
    const q=$("#searchHistory").value.toLowerCase(),h=JSON.parse(localStorage.getItem(HISTORY)||"[]").filter(x=>(x.s+" "+x.a).toLowerCase().includes(q));
    $("#history").innerHTML=h.length?h.map(x=>`<div class="history-item" data-id="${x.t}"><div class="expr"></div><div class="ans"></div><time></time></div>`).join(""):`<div class="empty">No matching calculations.</div>`;
    h.forEach(x=>{const el=document.querySelector(`[data-id="${x.t}"]`);el.querySelector(".expr").textContent=x.s;el.querySelector(".ans").textContent="= "+x.a;el.querySelector("time").textContent=new Date(x.t).toLocaleString();el.onclick=()=>{expr=x.s;$("#expression").textContent=expr;$("#answer").textContent=x.a}})
  }

  function calculate(){
    try{const original=expr,value=evaluate(expr),a=fmt(value);$("#expression").textContent=original+" =";$("#answer").textContent=a;last=value;save(original,a);stepsFor(original,a);expr=a;$("#status").textContent="Calculated";speak("The answer is "+a)}
    catch(e){$("#answer").textContent="Error";$("#status").textContent=e.message;expr="Error"}
  }

  function speak(text){if("speechSynthesis"in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=$("#language").value;speechSynthesis.speak(u)}}

  function wordsToDigits(s){
    const m={zero:"0",one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",ten:"10",eleven:"11",twelve:"12",twenty:"20",thirty:"30",forty:"40",fifty:"50",hundred:"100"};
    return s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred)\b/gi,x=>m[x.toLowerCase()]);
  }
function normalizeVoice(raw){
  let s = wordsToDigits(raw.toLowerCase());

  s = s.replace(/what is|calculate|calculate the|please|equals?|answer/gi,"")
    .replace(/to the power of|raised to the power of|power of|power/gi,"^")
    .replace(/multiplied by|multiply by|times|into/gi,"*")
    .replace(/divided by|divide by/gi,"/")
    .replace(/plus/gi,"+")
    .replace(/minus/gi,"-")
    .replace(/modulo|modulus|mod/gi,"%")
    .replace(/square root of|square root|root of/gi,"sqrt")
    .replace(/natural log of|ln of/gi,"ln")
    .replace(/log of/gi,"log")
    .replace(/sine of|sine/gi,"sin")
    .replace(/cosine of|cosine/gi,"cos")
    .replace(/tangent of|tangent/gi,"tan")
    .replace(/secant of|secant|sec/gi,"sec")
    .replace(/cosecant of|cosecant|csc/gi,"csc")
    .replace(/cotangent of|cotangent|cot/gi,"cot")
    .replace(/factorial of|factorial/gi,"!");

  s = s.replace(/\s+/g,"");

  // Convert voice functions into proper function calls
  s = s.replace(/sqrt(?=\d|pi|e|\()/g,"sqrt(")
       .replace(/sin(?=\d|pi|e|\()/g,"sin(")
       .replace(/cos(?=\d|pi|e|\()/g,"cos(")
       .replace(/tan(?=\d|pi|e|\()/g,"tan(")
       .replace(/sec(?=\d|pi|e|\()/g,"sec(")
       .replace(/csc(?=\d|pi|e|\()/g,"csc(")
       .replace(/cot(?=\d|pi|e|\()/g,"cot(")
       .replace(/log(?=\d|pi|e|\()/g,"log(")
       .replace(/ln(?=\d|pi|e|\()/g,"ln(");

  s = s.replace(/[^0-9a-zA-Z+\-*/%^().]/g,"");

  // Close simple voice function expressions
  const match = s.match(/^(sqrt|sin|cos|tan|sec|csc|cot|log|ln)\(([^()]*)$/i);

  if(match){
    s = `${match[1]}(${match[2]})`;
  }

  return s;
}

  function setListening(v){listening=v;$("#voice").classList.toggle("listening",v);$("#statusDot").classList.toggle("live",v);$("#status").textContent=v?"Listening…":"Ready";$("#voiceHint").textContent=v?"Speak your calculation":"Click and speak"}

  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){
    recognition=new SR();recognition.interimResults=false;recognition.maxAlternatives=1;
    recognition.onstart=()=>setListening(true);recognition.onend=()=>setListening(false);
    recognition.onerror=e=>{setListening(false);$("#status").textContent=e.error==="not-allowed"?"Microphone permission denied":"Voice input error"};
    recognition.onresult=e=>{const raw=e.results[0][0].transcript;$("#heard").textContent=`Heard: “${raw}”`;expr=normalizeVoice(raw);$("#expression").textContent=expr||"0";calculate()};
  }else{$("#voice").disabled=true;$("#voiceHint").textContent="Use Chrome or Edge for voice input"}

  $("#keys").onclick=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.action==="clear")clear();else if(b.dataset.action==="back")back();else if(b.dataset.action==="equals")calculate();else add(b.dataset.value)}
  document.onkeydown=e=>{if(/^[0-9.]$/.test(e.key)||"+-*/%^()".includes(e.key))add(e.key);else if(e.key==="Enter"||e.key==="=")calculate();else if(e.key==="Backspace")back();else if(e.key==="Escape")clear()}
  $("#voice").onclick=()=>{if(!recognition)return;recognition.lang=$("#language").value;try{listening?recognition.stop():recognition.start()}catch{}}
  $("#angleMode").onclick=()=>{angle=angle==="DEG"?"RAD":"DEG";$("#angleMode").textContent=angle;toast("Angle mode: "+angle)}
  $("#theme").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("vox_theme",document.body.classList.contains("light")?"light":"dark")}
  $("#copy").onclick=async()=>{try{await navigator.clipboard.writeText($("#answer").textContent);toast("Answer copied")}catch{toast("Copy unavailable")}}
  document.querySelectorAll("[data-memory]").forEach(b=>b.onclick=()=>{const a=Number($("#answer").textContent);const m=b.dataset.memory;if(m==="clear")memory=0;if(m==="recall")add(fmt(memory));if(m==="add")memory+=Number.isFinite(a)?a:0;if(m==="subtract")memory-=Number.isFinite(a)?a:0;toast("Memory "+m)})
  $("#clearHistory").onclick=()=>{localStorage.removeItem(HISTORY);renderHistory();toast("History cleared")}
  $("#searchHistory").oninput=renderHistory
  $("#export").onclick=()=>{const h=JSON.parse(localStorage.getItem(HISTORY)||"[]");if(!h.length)return toast("No history to export");const csv=[["Expression","Result","Time"],...h.map(x=>[x.s,x.a,new Date(x.t).toISOString()])].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="voxcalc-history.csv";a.click();URL.revokeObjectURL(a.href)}
  if(localStorage.getItem("vox_theme")==="light")document.body.classList.add("light");
  renderHistory();render();
})();
