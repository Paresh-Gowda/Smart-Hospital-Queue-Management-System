const $ = id => document.getElementById(id);
const KEY_QUEUE='swiftq_queue_v7';
const KEY_COUNTER='swiftq_counter_v7';
const EST_TIME_PER_PATIENT = 5; // minutes per patient

let queue = JSON.parse(localStorage.getItem(KEY_QUEUE)||'[]');
let counter = Number(localStorage.getItem(KEY_COUNTER)||1000);
let nowServing = null;
let countdownInterval = null;

// Toast notification
function toast(msg){ 
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}

// Save queue and counter
function save(){ 
  localStorage.setItem(KEY_QUEUE,JSON.stringify(queue));
  localStorage.setItem(KEY_COUNTER,counter);
}

// Sort: Emergency > Priority > Normal
function sortQueue(){
  queue.sort((a,b)=>{
    if(a.emergency&&!b.emergency) return -1;
    if(!a.emergency&&b.emergency) return 1;
    if(a.priority&&!b.priority) return -1;
    if(!a.priority&&b.priority) return 1;
    return a.timestamp - b.timestamp;
  });
}

// Real-time render of Now Serving with countdown & background
function renderNowServing(){
  const display = $('nowServing');
  if(!nowServing){ 
    display.textContent = '—'; 
    display.style.backgroundColor = '#fff';
    if(countdownInterval){ clearInterval(countdownInterval); countdownInterval=null; }
    return;
  }

  let remainingTime = EST_TIME_PER_PATIENT * 60; // seconds
  const totalTime = remainingTime;

  function updateDisplay(){
    const mins = Math.floor(remainingTime/60);
    const secs = remainingTime % 60;
    display.textContent = `${nowServing.id} — ${nowServing.name} (${nowServing.department}) | ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    // Background color: Green -> Yellow -> Red
    const percent = remainingTime / totalTime;
    if(percent > 0.5) display.style.backgroundColor = `rgba(0,200,0,${0.2 + 0.6*(percent-0.5)*2})`;
    else if(percent > 0.2) display.style.backgroundColor = `rgba(255,200,0,${0.2 + 0.6*((percent-0.2)/0.3)})`;
    else display.style.backgroundColor = `rgba(255,50,50,${0.4 + 0.6*(0.2-percent)/0.2})`;

    // Animate wait bars of other patients in queue
    queue.forEach((t, idx)=>{
      const tokenDiv = document.getElementById(`token-${t.id}`);
      if(tokenDiv){
        const bar = tokenDiv.querySelector('.wait-bar');
        const elapsed = EST_TIME_PER_PATIENT*(idx+1) - remainingTime/60; // in minutes
        const widthPercent = Math.min((elapsed / (queue.length * EST_TIME_PER_PATIENT)) * 100, 100);
        bar.style.width = widthPercent + '%';
      }
    });

    if(remainingTime <= 0){
      clearInterval(countdownInterval);
      countdownInterval = null;
      toast(`Time over for ${nowServing.id}, calling next patient`);
      callNext();
    }
    remainingTime--;
  }

  if(countdownInterval) clearInterval(countdownInterval);
  updateDisplay();
  countdownInterval = setInterval(updateDisplay, 1000);
}

// Render queue with wait time & progress bars
function renderQueue(filter=""){
  const container = $('queueContainer'); container.innerHTML="";
  const f=filter.toLowerCase();
  const list = queue.filter(t=>t.id.toLowerCase().includes(f) || t.name.toLowerCase().includes(f));

  if(!list.length){ container.innerHTML='<div class="muted">No tokens in queue.</div>'; return; }

  let waitTimeCumulative = 0;
  const totalWait = queue.length * EST_TIME_PER_PATIENT;

  list.forEach((t, idx)=>{
    const div=document.createElement('div'); div.className='token'; div.id = `token-${t.id}`;
    const left=document.createElement('div'); left.style.display='flex'; left.style.flexDirection='column';
    
    const topInfo=document.createElement('div'); topInfo.style.display='flex'; topInfo.style.alignItems='center';
    const badge=document.createElement('div'); badge.className='badge'; badge.textContent=t.id.replace('T','');
    
    const meta=document.createElement('div'); meta.className='meta';
    meta.innerHTML=`
      <div style="font-weight:600">${t.name}</div>
      <div class="muted">${t.department} • ${new Date(t.timestamp).toLocaleTimeString()}</div>
      <div class="muted">Wait time: ${waitTimeCumulative} min</div>
    `;
    topInfo.append(badge,meta);
    left.append(topInfo);

    // Progress bar
    const progressContainer=document.createElement('div'); progressContainer.className='wait-bar-container';
    const progressBar=document.createElement('div'); progressBar.className='wait-bar';
    if(t.emergency) progressBar.classList.add('wait-emergency');
    else if(t.priority) progressBar.classList.add('wait-priority');
    else progressBar.classList.add('wait-normal');

    // Initial width based on cumulative wait time
    const widthPercent = Math.min((waitTimeCumulative / totalWait) * 100, 100);
    progressBar.style.width = widthPercent + '%';

    progressContainer.appendChild(progressBar);
    left.appendChild(progressContainer);

    const right=document.createElement('div'); right.style.display='flex'; right.style.gap='8px'; right.style.alignItems='center';
    if(t.emergency) right.innerHTML=`<span style="color:#ff5252;font-weight:600;">EMERGENCY</span>`;
    else if(t.priority) right.innerHTML=`<span style="color:#ffb84d;font-weight:600;">PRIORITY</span>`;

    const mkBtn=(txt,fn)=>{ const b=document.createElement('button'); b.textContent=txt; b.onclick=fn; b.className='small'; return b; }
    right.append(mkBtn('Call',()=>callToken(t.id)), mkBtn('Promote',()=>promote(t.id)), mkBtn('Remove',()=>removeToken(t.id)));

    div.append(left,right); container.appendChild(div);

    waitTimeCumulative += EST_TIME_PER_PATIENT;
  });

  renderStats();
}

// Queue stats
function renderStats(){
  const total=queue.length;
  const priority=queue.filter(t=>t.priority&&!t.emergency).length;
  const emergency=queue.filter(t=>t.emergency).length;
  $('queueStats').textContent=`Total: ${total} | Priority: ${priority} | Emergency: ${emergency}`;
}

// Generate token
function generate(){
  counter++;
  const token={
    id:'T'+counter,
    name:$('patientName').value.trim()||'Anonymous',
    department:$('department').value,
    priority:$('priorityCheck').checked,
    emergency:false,
    timestamp:Date.now()
  };
  queue.push(token); sortQueue(); save(); renderQueue(); toast(`Token ${token.id} generated`);
  $('patientName').value=''; $('priorityCheck').checked=false;
}

// Call token
function callToken(id){
  const idx=queue.findIndex(t=>t.id===id);
  if(idx>-1){ nowServing=queue.splice(idx,1)[0]; save(); renderQueue(); renderNowServing(); toast(`Now serving ${nowServing.id}`); }
}

// Promote emergency
function promote(id){
  const t=queue.find(x=>x.id===id);
  if(t&&!t.emergency){ t.emergency=true; sortQueue(); save(); renderQueue(); toast(`${t.id} promoted to emergency`); }
}

// Remove token
function removeToken(id){ if(confirm(`Remove ${id}?`)){ queue=queue.filter(t=>t.id!==id); save(); renderQueue(); } }

// Call next patient
function callNext(){ if(queue.length) callToken(queue[0].id); else { nowServing=null; renderNowServing(); toast('Queue empty'); } }

// Simulate emergency
function simulateEmergency(){
  const available=queue.filter(t=>!t.emergency);
  if(!available.length){ toast('No tokens to promote'); return; }
  const pick=available[Math.floor(Math.random()*available.length)];
  promote(pick.id);
}

// Clear queue
function clearQueue(){
  if(confirm('Clear queue?')){ queue=[]; counter=1000; nowServing=null; save(); renderQueue(); renderNowServing(); toast('Queue cleared'); }
}

// Event listeners
$('genBtn').onclick=generate;
$('callNextBtn').onclick=callNext;
$('simulateEmergency').onclick=simulateEmergency;
$('clearBtn').onclick=clearQueue;
$('searchInput').oninput=e=>renderQueue(e.target.value);

// Initial demo data
if(!queue.length){
  queue.push({id:'T1001',name:'Rita Sharma',department:'OPD',priority:false,emergency:false,timestamp:Date.now()});
  queue.push({id:'T1002',name:'Aman Verma',department:'General',priority:true,emergency:false,timestamp:Date.now()});
  queue.push({id:'T1003',name:'Maya Patel',department:'Pharmacy',priority:false,emergency:false,timestamp:Date.now()});
  save();
}

sortQueue(); renderQueue(); renderNowServing();
