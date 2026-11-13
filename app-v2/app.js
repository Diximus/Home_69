
(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:3});
const uid = () => 'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const STORE='home69_v2_state', PB_CFG='home69_v2_pb';
let state=null, pb=null, pbRecord=null, syncTimer=null, chart=null, activeView='dashboard', extraPayments=[];
const defaultApt = {
 id:'apt69',name:'Квартира №69',address:'',kind:'apartment',area:46.8,persons:1,electricityMode:'dual',
 enabled:{gas:true,water:true,electricity:true},tariffs:{gas:9.28,water:45.89,sewage:100.37,t1:5.57,t2:3.4,electricity:0,cap_repair:475.49},
 services:[],meters:[],readings:[]
};
const defaultState=()=>({version:2,activeId:'apt69',apartments:[JSON.parse(JSON.stringify(defaultApt))],payments:{},extraPayments:[]});
function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function monthKey(v){if(!v)return '';if(/^\d{4}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})\/(\d{2,4})$/);if(m)return (m[2].length===2?'20'+m[2]:m[2])+'-'+m[1].padStart(2,'0');const names={'января':'01','январь':'01','февраля':'02','февраль':'02','марта':'03','март':'03','апреля':'04','апрель':'04','мая':'05','май':'05','июня':'06','июнь':'06','июля':'07','июль':'07','августа':'08','август':'08','сентября':'09','сентябрь':'09','октября':'10','октябрь':'10','ноября':'11','ноябрь':'11','декабря':'12','декабрь':'12'};const s=v.toLowerCase();for(const k in names)if(s.includes(k)){const y=s.match(/20\d{2}/);return (y?y[0]:'2026')+'-'+names[k]}return ''}
function monthLabel(k){if(!k)return '—';const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}
function sortReadings(a){return [...a].sort((x,y)=>monthKey(x.month).localeCompare(monthKey(y.month)))}
function current(){return state.apartments.find(a=>a.id===state.activeId)||state.apartments[0]}
function persist(){localStorage.setItem(STORE,JSON.stringify(state));scheduleSync()}
function migrateLegacy(old){
 const s=defaultState(), d=old.data||{}, aptRows=d.apt69||[], kirbyRows=d.kirby||[];
 const tariffs=old.tariffs||{};
 const apt=Object.assign({},defaultApt,{tariffs:Object.assign({},defaultApt.tariffs,tariffs),services:[],meters:[],readings:[]});
 apt.readings=aptRows.map(r=>({month:monthKey(r.month)||r.month,water:r.water,gas:r.gas,t1:r.t1,t2:r.t2,cons_water:r.cons_water,cons_gas:r.cons_gas,cons_t1:r.cons_t1,cons_t2:r.cons_t2,invoice_sum:r.invoice_sum,total:r.total,cap_repair:r.cap_repair}));
 const units={'м²':'area','чел':'person','кв-ра':'flat','фикс':'fixed'};
 apt.services=(old.services||[]).map(x=>({id:uid(),name:x.name,unit:units[x.unit]||'flat',rate:Number(x.tariff??x.amount??0),enabled:true,legacyAmount:Number(x.amount)||0}));
 apt.meters=(old.meters?.['69']||[]).map(x=>({id:uid(),name:x.name,serial:x.number||'',lastCheck:x.lastCheck||'',nextCheck:x.nextCheck||'',unit:x.unit||'',kind:x.name.includes('Вода')?'water':x.name.includes('Газ')?'gas':'electricity'}));
 apt.area=46.8;
 const kirby=Object.assign({},defaultApt,{id:'kirby',name:'Кирби',address:'Частный дом',kind:'house',area:0,persons:1,electricityMode:'single',enabled:{gas:true,water:false,electricity:true},tariffs:{gas:tariffs.gas||9.28,electricity:Number(old.kirbyTariff)||4.85,cap_repair:0},services:[],meters:[],readings:[]});
 kirby.readings=kirbyRows.map(r=>({month:monthKey(r.month)||r.month,gas:r.gas,elec:r.elec,cons_gas:r.cons_gas,cons_elec:r.cons_elec}));
 kirby.meters=(old.meters?.kirby||[]).map(x=>({id:uid(),name:x.name,serial:x.number||'',lastCheck:x.lastCheck||'',nextCheck:x.nextCheck||'',unit:x.unit||'',kind:x.name.toLowerCase().includes('газ')?'gas':'electricity'}));
 s.apartments=[apt,kirby];
 // Preserve legacy payments verbatim; payment editor can display and extend these records.
 s.payments=old.payments||{};
 s.extraPayments=[];
 return s;
}
async function loadInitial(){
 let stored=null;try{stored=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
 if(stored&&stored.version===2){state=stored;extraPayments=stored.extraPayments||[];return}
 try{const r=await fetch('initial-data.json',{cache:'no-store'});if(r.ok){const old=await r.json();state=migrateLegacy(old);extraPayments=state.extraPayments||[];persist();return}}catch(e){console.warn('Initial history file unavailable',e)}
 state=defaultState();extraPayments=[];
}
function readingUsage(a,field,index){
 const rows=sortReadings(a.readings), i=rows.indexOf(index);
 if(index['cons_'+field]!=null)return Number(index['cons_'+field])||0;
 const prev=rows[rows.indexOf(index)-1];const key=field==='elec'?'elec':field;
 if(!prev||index[key]==null||prev[key]==null)return 0;
 return Math.max(0,Number(index[key])-Number(prev[key]));
}
function activeResources(a){const x=[];if(a.enabled.gas)x.push({key:'gas',label:'Газ',unit:'м³',icon:'♨',color:'#ffad42'});if(a.enabled.water)x.push({key:'water',label:'Холодная вода',unit:'м³',icon:'💧',color:'#39b9ff'});if(a.enabled.electricity){if(a.electricityMode==='dual'){x.push({key:'t1',label:'Электроэнергия Т1',unit:'кВт·ч',icon:'ϟ',color:'#f7ca54'},{key:'t2',label:'Электроэнергия Т2',unit:'кВт·ч',icon:'ϟ',color:'#37d6a2'})}else x.push({key:'elec',label:'Электроэнергия',unit:'кВт·ч',icon:'ϟ',color:'#f7ca54'})}return x}
function currentUsage(a,field){const rows=sortReadings(a.readings),last=rows[rows.length-1];if(!last)return 0;const idx=rows.length-1;return readingUsage(a,field,last)}
function estimate(a,r){
 if(!r)return 0;const use={gas:Number(r.cons_gas)||0,water:Number(r.cons_water)||0,t1:Number(r.cons_t1)||0,t2:Number(r.cons_t2)||0,elec:Number(r.cons_elec)||0};
 let total=0;if(a.enabled.gas)total+=use.gas*(a.tariffs.gas||0);
 if(a.enabled.water)total+=use.water*((a.tariffs.water||0)+(a.tariffs.sewage||0));
 if(a.enabled.electricity)total+=a.electricityMode==='dual'?use.t1*(a.tariffs.t1||0)+use.t2*(a.tariffs.t2||0):use.elec*(a.tariffs.electricity||0);
 (a.services||[]).filter(x=>x.enabled!==false).forEach(x=>{const q=x.unit==='area'?a.area:x.unit==='person'?a.persons:x.unit==='flat'?1:1;total+=Number(x.rate||0)*Number(q||0)});
 total+=Number(r.cap_repair??a.tariffs.cap_repair??0);
 return Math.round(total*100)/100;
}
function paymentFor(a,k){const p=state.payments[a.id]||{};return p[k]||{}}
function latestMonth(a){const rows=sortReadings(a.readings);return rows.length?monthKey(rows[rows.length-1].month):''}
function changeView(v){activeView=v;$$('.section').forEach(x=>x.classList.toggle('active',x.id==='view-'+v));$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));const titles={dashboard:['Обзор объекта','Показания, расходы и платежи в одном месте'],readings:['Внести показания','Фиксируйте показания приборов учёта'],history:['История и аналитика','Исторические данные и динамика потребления'],payments:['Счета и платежи','Начисления, фактические оплаты и разовые платежи'],meters:['Приборы учёта','Номера, поверки и обслуживание счётчиков'],tariffs:['Тарифы и услуги','Настройка начислений для выбранного объекта'],settings:['Объекты и настройки','Управление квартирами, домами и синхронизацией']};$('#page-title').textContent=titles[v][0];$('#page-subtitle').textContent=titles[v][1];render();if(v==='history')drawChart('history-chart',current(),$('#history-range').value)}
function render(){
 const a=current();if(!a)return;
 $('#apartment-select').innerHTML=state.apartments.map(x=>'<option value="'+x.id+'" '+(x.id===a.id?'selected':'')+'>'+esc(x.name)+'</option>').join('');
 $('#side-apartment').textContent=a.name;$('#side-address').textContent=a.address||a.kind;
 if(activeView==='dashboard')renderDashboard(a);
 if(activeView==='readings')renderReadingForm(a);
 if(activeView==='history')renderHistory(a);
 if(activeView==='payments')renderPayments(a);
 if(activeView==='meters')renderMeters(a);
 if(activeView==='tariffs')renderTariffs(a);
 if(activeView==='settings')renderSettings();
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function summary(label,value,foot,icon,color){return '<div class="card summary-card" style="--glow:'+color+';--tint:'+color+'33"><div class="summary-head"><span>'+label+'</span><span class="summary-icon">'+icon+'</span></div><div class="summary-value">'+value+'</div><div class="summary-foot">'+foot+'</div></div>'}
function renderDashboard(a){
 const rows=sortReadings(a.readings),last=rows[rows.length-1],prev=rows[rows.length-2],k=last?monthKey(last.month):'',pay=paymentFor(a,k),estimateValue=estimate(a,last),actual=pay.invoiceAmount!=null?Number(pay.invoiceAmount):null,paid=pay.paidAmount!=null?Number(pay.paidAmount):null;
 const due=actual!=null?Math.max(0,actual-(paid||0)):Math.max(0,estimateValue-(paid||0));
 $('#summary-cards').innerHTML=summary('Расчётное начисление',fmt(estimateValue)+' ₽',last?monthLabel(k):'Добавьте первые показания','▤','#238fff')+summary('Фактически оплачено',fmt(paid||0)+' ₽',pay.paid?'Платёж отмечен как оплаченный':'Вводится вручную','✓','#19d99b')+summary('Остаток к оплате',fmt(due)+' ₽',due?'Оценка до получения квитанции':'Задолженности по введённым данным нет','◷','#ffad42')+summary('Показания за месяц',last?monthLabel(k):'Нет записей',last?'Последняя запись':'Ожидается ввод','◉','#9d7bff');
 const res=activeResources(a);
 $('#current-meters').innerHTML=last?res.map(x=>{const val=last[x.key];const delta=last['cons_'+x.key]??(prev&&val!=null&&prev[x.key]!=null?Number(val)-Number(prev[x.key]):null);return '<div class="meter-row"><div class="meter-symbol" style="background:'+x.color+'22;color:'+x.color+'">'+x.icon+'</div><div class="meter-info"><strong>'+x.label+'</strong><small>Расход за период: '+(delta==null?'—':fmtN(delta))+' '+x.unit+'</small></div><div class="meter-value">'+(val==null?'—':fmtN(val))+'<small>'+x.unit+'</small></div></div>'}).join(''):'<div class="empty">Пока нет показаний</div>';
 $('#reading-date').textContent=last?monthLabel(k):'Нет записей';
 $('#recent-history').innerHTML=historyTable(rows.slice(-5).reverse(),a);
 const pkeys=Object.keys(state.payments[a.id]||{}).filter(x=>/^\d{4}-\d{2}$/.test(x)).sort().reverse().slice(0,4);
 $('#recent-payments').innerHTML=pkeys.length?pkeys.map(m=>{const p=paymentFor(a,m);return '<div class="meter-row"><div class="meter-symbol">₽</div><div class="meter-info"><strong>'+monthLabel(m)+'</strong><small>Начисление: '+fmt(p.invoiceAmount??estimate(a,rows.find(x=>monthKey(x.month)===m)))+' ₽</small></div><div class="meter-value">'+fmt(p.paidAmount||0)+'<small>оплачено</small></div></div>'}).join(''):'<div class="empty">Оплаты появятся здесь</div>';
 drawChart('usage-chart',a,'12');
}
function historyTable(rows,a){if(!rows.length)return '<div class="empty">Нет записей</div>';let cols=activeResources(a);return '<table><thead><tr><th>Период</th>'+cols.map(x=>'<th>'+x.label+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(monthLabel(monthKey(r.month))||r.month)+'</td>'+cols.map(x=>'<td>'+fmtN(r[x.key])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
function renderReadingForm(a){
 const m=$('#reading-month');if(!m.value){const n=new Date();m.value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')}
 $('#electricity-mode').value=a.enabled.electricity?(a.electricityMode==='dual'?'Двухтарифный (Т1 / Т2)':'Однотарифный'):'Не используется';
 const fields=[];if(a.enabled.gas)fields.push(['gas','Газ','м³','♨']);if(a.enabled.water)fields.push(['water','Холодная вода','м³','💧']);if(a.enabled.electricity){if(a.electricityMode==='dual'){fields.push(['t1','Электроэнергия Т1','кВт·ч','ϟ'],['t2','Электроэнергия Т2','кВт·ч','ϟ'])}else fields.push(['elec','Электроэнергия','кВт·ч','ϟ'])}
 const last=sortReadings(a.readings).slice(-1)[0]||{};
 $('#reading-fields').innerHTML=fields.map(f=>'<div class="field"><label>'+f[3]+' '+f[1]+' · '+f[2]+'</label><input name="'+f[0]+'" type="number" min="0" step="0.001" required placeholder="Предыдущее: '+(last[f[0]]??'—')+'"><small>Текущее показание</small></div>').join('')||'<div class="empty">Для объекта не выбраны приборы учёта. Настройте их в разделе «Объекты».</div>';
}
function renderHistory(a){const n=$('#history-range').value;$('#full-history').innerHTML=historyTable(sortReadings(a.readings).slice().reverse(),a);$('#history-count').textContent=a.readings.length+' записей';drawChart('history-chart',a,n)}
function drawChart(id,a,range){
 const canvas=document.getElementById(id);if(!canvas||!window.Chart)return;if(chart&&chart.canvas.id===id)chart.destroy();
 const rows=sortReadings(a.readings);let selected=range==='all'?rows:rows.slice(-Number(range));const resources=activeResources(a);
 chart=new Chart(canvas,{type:'line',data:{labels:selected.map(x=>monthLabel(monthKey(x.month)).replace(' г.','')),datasets:resources.map(x=>({label:x.label,data:selected.map(r=>r['cons_'+x.key]??0),borderColor:x.color,backgroundColor:x.color+'22',tension:.35,borderWidth:2,pointRadius:2,fill:false}))},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#b8cbe4',usePointStyle:true,boxWidth:8,font:{size:10}}}},scales:{x:{ticks:{color:'#8fa6c5',maxRotation:0,autoSkip:true},grid:{color:'#ffffff0b'}},y:{beginAtZero:true,ticks:{color:'#8fa6c5'},grid:{color:'#ffffff12'}}}}});
}
function renderPayments(a){
 const rows=sortReadings(a.readings),keys=[...new Set([...rows.map(x=>monthKey(x.month)),...Object.keys(state.payments[a.id]||{}).filter(x=>/^\d{4}-\d{2}$/.test(x))])].filter(Boolean).sort().reverse();
 let paidSum=0,estimateSum=0,dueSum=0;keys.forEach(k=>{const p=paymentFor(a,k),r=rows.find(x=>monthKey(x.month)===k),e=estimate(a,r),inv=p.invoiceAmount??e,paid=Number(p.paidAmount)||0;estimateSum+=Number(inv)||0;paidSum+=paid;dueSum+=Math.max(0,(Number(inv)||0)-paid)});
 $('#payment-summary').innerHTML=summary('Всего начислено',fmt(estimateSum)+' ₽',keys.length+' периодов','▤','#238fff')+summary('Всего оплачено',fmt(paidSum)+' ₽','По введённым платежам','✓','#19d99b')+summary('Остаток',fmt(dueSum)+' ₽','По сохранённым начислениям','◷','#ffad42')+summary('Разовые платежи',fmt(extraPayments.filter(x=>x.apartmentId===a.id).reduce((s,x)=>s+Number(x.amount||0),0))+' ₽','ТО и прочие услуги','＋','#9d7bff');
 $('#payments-table').innerHTML=keys.length?'<table><thead><tr><th>Период</th><th>Расчётное начисление</th><th>Сумма квитанции</th><th>Оплачено</th><th>Остаток</th><th>Статус</th><th></th></tr></thead><tbody>'+keys.map(k=>{const p=paymentFor(a,k),r=rows.find(x=>monthKey(x.month)===k),e=estimate(a,r),inv=p.invoiceAmount??e,paid=Number(p.paidAmount)||0;return '<tr><td>'+monthLabel(k)+'</td><td>'+fmt(e)+' ₽</td><td>'+fmt(inv)+' ₽</td><td>'+fmt(paid)+' ₽</td><td>'+fmt(Math.max(0,inv-paid))+' ₽</td><td><span class="pill '+(p.paid?'':'warn')+'">'+(p.paid?'Оплачено':'Не отмечено')+'</span></td><td><button class="btn btn-soft edit-payment" data-month="'+k+'">Изменить</button></td></tr>'}).join('')+'</tbody></table>':'<div class="empty">Нет периодов для отображения</div>';
 const extras=extraPayments.filter(x=>x.apartmentId===a.id).sort((x,y)=>y.date.localeCompare(x.date));
 $('#extra-payments-table').innerHTML=extras.length?'<table><thead><tr><th>Дата</th><th>Назначение</th><th>Сумма</th><th>Статус</th><th></th></tr></thead><tbody>'+extras.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.name)+'</td><td>'+fmt(x.amount)+' ₽</td><td>'+(x.paid?'Оплачено':'Ожидает оплаты')+'</td><td><button class="btn btn-soft toggle-extra" data-id="'+x.id+'">'+(x.paid?'Снять оплату':'Оплатить')+'</button></td></tr>').join('')+'</tbody></table>':'<div class="empty">Разовых платежей пока нет</div>';
}
function renderMeters(a){
 $('#meters-grid').innerHTML=a.meters.length?a.meters.map(m=>'<article class="card"><div class="card-title"><span>'+esc(m.name)+'</span><span class="pill">'+esc(m.unit)+'</span></div><div style="font-size:12px;color:var(--muted)">Серийный номер</div><div style="font-size:20px;font-weight:800;margin:3px 0 14px">'+esc(m.serial||'Не указан')+'</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div><small class="muted">Последняя поверка</small><div>'+esc(m.lastCheck||'—')+'</div></div><div><small class="muted">Следующая поверка</small><div class="'+(m.nextCheck&&m.nextCheck<new Date().toISOString().slice(0,7)?'red':'green')+'">'+esc(m.nextCheck||'—')+'</div></div></div><div class="form-actions"><button class="btn btn-soft edit-meter" data-id="'+m.id+'">Изменить</button><button class="btn btn-danger delete-meter" data-id="'+m.id+'">Удалить</button></div></article>').join(''):'<div class="card empty">Для этого объекта пока не добавлены приборы учёта</div>';
}
function renderTariffs(a){
 const defs=[['gas','Газ · ₽/м³'],['water','Холодная вода · ₽/м³'],['sewage','Водоотведение · ₽/м³'],['t1','Электричество Т1 · ₽/кВт·ч'],['t2','Электричество Т2 · ₽/кВт·ч'],['electricity','Электричество · ₽/кВт·ч'],['cap_repair','Капитальный ремонт · ₽/мес']];
 $('#tariff-fields').innerHTML=defs.filter(x=>x[0]==='gas'?a.enabled.gas:x[0]==='water'||x[0]==='sewage'?a.enabled.water:x[0]==='t1'||x[0]==='t2'?a.enabled.electricity&&a.electricityMode==='dual':x[0]==='electricity'?a.enabled.electricity&&a.electricityMode==='single':true).map(x=>'<div class="field"><label>'+x[1]+'</label><input type="number" min="0" step="0.0001" name="'+x[0]+'" value="'+(a.tariffs[x[0]]??0)+'"></div>').join('');
 $('#services-list').innerHTML=(a.services||[]).map(s=>'<div class="service-row" data-id="'+s.id+'"><input data-service="name" value="'+esc(s.name)+'" aria-label="Название услуги"><select data-service="unit"><option value="person" '+(s.unit==='person'?'selected':'')+'>₽/чел·мес</option><option value="flat" '+(s.unit==='flat'?'selected':'')+'>₽/квартира·мес</option><option value="area" '+(s.unit==='area'?'selected':'')+'>₽/м²·мес</option><option value="fixed" '+(s.unit==='fixed'?'selected':'')+'>Фиксированная сумма</option></select><input data-service="rate" type="number" step=".01" value="'+Number(s.rate||0)+'" aria-label="Тариф"><span class="small-note">'+fmt(serviceCost(a,s))+' ₽/мес</span><button class="btn btn-danger remove-service" data-id="'+s.id+'">✕</button></div>').join('')||'<div class="empty">Дополнительных услуг нет</div>';
}
function serviceCost(a,s){return Number(s.rate||0)*(s.unit==='area'?Number(a.area||0):s.unit==='person'?Number(a.persons||0):1)}
function renderSettings(){
 $('#apartments-list').innerHTML=state.apartments.map(a=>'<div class="meter-row" style="margin-bottom:9px"><div class="meter-symbol">⌂</div><div class="meter-info"><strong>'+esc(a.name)+'</strong><small>'+esc(a.address||a.kind)+' · '+(a.electricityMode==='dual'?'Т1/Т2':'один тариф')+'</small></div><button class="btn btn-soft edit-apartment" data-id="'+a.id+'">Настроить</button>'+(state.apartments.length>1?'<button class="btn btn-danger delete-apartment" data-id="'+a.id+'">Удалить</button>':'')+'</div>').join('');
}
function showModal(title,body){$('#modal-title').textContent=title;$('#modal-content').innerHTML=body;$('#modal-backdrop').classList.add('open')}
function closeModal(){$('#modal-backdrop').classList.remove('open')}
function addMeterForm(m){
 const a=current();showModal(m?'Изменить прибор':'Новый прибор','<form id="meter-form"><div class="form-grid"><div class="field"><label>Название</label><input name="name" required value="'+esc(m?.name||'')+'" placeholder="Газовый счётчик"></div><div class="field"><label>Тип</label><select name="kind"><option value="gas">Газ</option><option value="water">Вода</option><option value="electricity">Электричество</option></select></div><div class="field"><label>Серийный номер</label><input name="serial" value="'+esc(m?.serial||'')+'"></div><div class="field"><label>Единица измерения</label><input name="unit" value="'+esc(m?.unit||'м³')+'"></div><div class="field"><label>Последняя поверка</label><input name="lastCheck" type="month" value="'+esc(m?.lastCheck||'')+'"></div><div class="field"><label>Следующая поверка</label><input name="nextCheck" type="month" value="'+esc(m?.nextCheck||'')+'"></div></div><div class="form-actions"><button class="btn btn-primary">Сохранить прибор</button></div></form>');
 const f=$('#meter-form');if(m)f.elements.kind.value=m.kind||'gas';f.onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(f));if(m)Object.assign(m,o);else a.meters.push(Object.assign({id:uid()},o));persist();closeModal();render();toast('Прибор сохранён')};
}
function apartmentForm(a){
 const edit=!!a;const o=a||{name:'',address:'',kind:'apartment',area:0,persons:1,electricityMode:'dual',enabled:{gas:true,water:true,electricity:true}};
 showModal(edit?'Настройки объекта':'Добавить объект','<form id="apt-form"><div class="form-grid"><div class="field"><label>Название</label><input name="name" required value="'+esc(o.name)+'"></div><div class="field"><label>Тип объекта</label><select name="kind"><option value="apartment">Квартира</option><option value="house">Частный дом</option><option value="other">Другое</option></select></div><div class="field full"><label>Адрес / описание</label><input name="address" value="'+esc(o.address||'')+'"></div><div class="field"><label>Площадь, м²</label><input name="area" type="number" min="0" step=".1" value="'+Number(o.area||0)+'"></div><div class="field"><label>Количество проживающих</label><input name="persons" type="number" min="0" step="1" value="'+Number(o.persons||0)+'"></div><div class="field full"><label>Электросчётчик</label><select name="electricityMode"><option value="single">Однотарифный</option><option value="dual">Двухтарифный Т1 / Т2</option><option value="none">Не используется</option></select></div><div class="field full"><label>Какие показания подавать</label><label><input type="checkbox" name="gas" '+(o.enabled.gas?'checked':'')+'> Газ</label><label><input type="checkbox" name="water" '+(o.enabled.water?'checked':'')+'> Холодная вода</label><label><input type="checkbox" name="electricity" '+(o.enabled.electricity?'checked':'')+'> Электричество</label></div></div><div class="form-actions"><button class="btn btn-primary">Сохранить объект</button></div></form>');
 const f=$('#apt-form');f.elements.kind.value=o.kind;f.elements.electricityMode.value=o.electricityMode==='none'?'none':o.electricityMode;
 f.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));const enabled={gas:f.elements.gas.checked,water:f.elements.water.checked,electricity:f.elements.electricity.checked};if(edit){Object.assign(a,{name:v.name,address:v.address,kind:v.kind,area:Number(v.area),persons:Number(v.persons),electricityMode:v.electricityMode==='none'?'single':v.electricityMode,enabled});if(v.electricityMode==='none')a.enabled.electricity=false}else{const n=Object.assign({},defaultApt,{id:uid(),name:v.name,address:v.address,kind:v.kind,area:Number(v.area),persons:Number(v.persons),electricityMode:v.electricityMode==='none'?'single':v.electricityMode,enabled});if(v.electricityMode==='none')n.enabled.electricity=false;state.apartments.push(n);state.activeId=n.id}persist();closeModal();render();toast('Объект сохранён')};
}
function paymentForm(k){
 const a=current(),p=paymentFor(a,k),r=sortReadings(a.readings).find(x=>monthKey(x.month)===k),est=estimate(a,r);
 showModal('Сумма квитанции и оплата','<form id="payment-form"><div class="warning-box">Расчётное начисление: <b>'+fmt(est)+' ₽</b>. Оно может отличаться от реальной квитанции — укажите фактическую сумму ниже.</div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Месяц</label><input name="month" type="month" value="'+k+'" required></div><div class="field"><label>Фактическая сумма квитанции, ₽</label><input name="invoiceAmount" type="number" min="0" step=".01" value="'+(p.invoiceAmount??'')+'" placeholder="'+fmt(est)+'"></div><div class="field"><label>Фактически оплачено, ₽</label><input name="paidAmount" type="number" min="0" step=".01" value="'+(p.paidAmount??'')+'"></div><div class="field"><label><span><input name="paid" type="checkbox" '+(p.paid?'checked':'')+'> Платёж полностью оплачен</span></label></div></div><div class="form-actions"><button class="btn btn-primary">Сохранить</button></div></form>');
 $('#payment-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f)),m=v.month;state.payments[a.id]=state.payments[a.id]||{};state.payments[a.id][m]={invoiceAmount:v.invoiceAmount===''?null:Number(v.invoiceAmount),paidAmount:v.paidAmount===''?0:Number(v.paidAmount),paid:f.elements.paid.checked};persist();closeModal();render();toast('Платёж сохранён')};
}
function extraPaymentForm(){
 const a=current();showModal('Разовый или ежегодный платёж','<form id="extra-form"><div class="form-grid"><div class="field full"><label>Назначение</label><input name="name" required placeholder="ТО газового котла и плиты"></div><div class="field"><label>Дата</label><input name="date" type="date" required value="'+new Date().toISOString().slice(0,10)+'"></div><div class="field"><label>Сумма, ₽</label><input name="amount" type="number" min="0" step=".01" required></div><div class="field"><label>Периодичность</label><select name="frequency"><option value="once">Разовый платёж</option><option value="annual">Ежегодный</option></select></div><div class="field"><label><input name="paid" type="checkbox"> Уже оплачено</label></div></div><div class="form-actions"><button class="btn btn-primary">Добавить платёж</button></div></form>');
 $('#extra-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f));extraPayments.push({id:uid(),apartmentId:a.id,name:v.name,date:v.date,amount:Number(v.amount),frequency:v.frequency,paid:f.elements.paid.checked});state.extraPayments=extraPayments;persist();closeModal();render();toast('Платёж добавлен')};
}
function addService(){const a=current();a.services.push({id:uid(),name:'Новая услуга',unit:'flat',rate:0,enabled:true});persist();render()}
function renderServiceTotals(){const a=current();$$('.service-row').forEach(row=>{const s=a.services.find(x=>x.id===row.dataset.id);if(!s)return;s.name=row.querySelector('[data-service=name]').value;s.unit=row.querySelector('[data-service=unit]').value;s.rate=Number(row.querySelector('[data-service=rate]').value)||0;row.children[3].textContent=fmt(serviceCost(a,s))+' ₽/мес'});persist()}
function exportJson(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='home69-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();URL.revokeObjectURL(url)}
function exportCsv(){const a=current(),rows=sortReadings(a.readings),keys=activeResources(a),lines=[['Период',...keys.map(x=>x.label)].join(';'),...rows.map(r=>[monthLabel(monthKey(r.month)),...keys.map(x=>r[x.key]??'')].join(';'))];const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),l=document.createElement('a');l.href=url;l.download='home69-history.csv';l.click();URL.revokeObjectURL(url)}
function saveLocalReading(v){
 const a=current(),month=v.month,rows=sortReadings(a.readings),prev=rows.filter(x=>monthKey(x.month)<month).slice(-1)[0],r={month};
 activeResources(a).forEach(x=>{const val=Number(v[x.key]);r[x.key]=val;const p=prev?.[x.key];r['cons_'+x.key]=p==null?null:Math.round((val-Number(p))*1000)/1000});
 const ix=a.readings.findIndex(x=>monthKey(x.month)===month);if(ix>=0)a.readings[ix]=Object.assign({},a.readings[ix],r);else a.readings.push(r);
 persist();toast('Показания сохранены');changeView('dashboard');
}
function loadLegacyPayments(){
 // Convert old month-key payments to the current YYYY-MM form on first import.
 state.apartments.forEach(a=>{const legacy=state.payments[a.id==='apt69'?'69':a.id]||{};const converted={};Object.entries(legacy).forEach(([k,v])=>{if(k.startsWith('gas_')||k.startsWith('cap_')||k.startsWith('rent_'))return;const m=monthKey(k);if(m)converted[m]={invoiceAmount:v.invoice_amount??null,paidAmount:v.paid??0,paid:v.paid_status===true||v.paid!=null}});state.payments[a.id]=Object.assign(converted,state.payments[a.id]||{})});
}
function importJson(file){const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);if(x.version===2&&Array.isArray(x.apartments))state=x;else state=migrateLegacy(x);extraPayments=state.extraPayments||[];persist();render();toast('История импортирована')}catch(e){toast('Не удалось прочитать JSON')}};reader.readAsText(file)}
function updateSync(text,status){$('#sync-label').textContent=text;$('#sync-dot').style.background=status==='ok'?'#20d69a':status==='error'?'#ff657e':'#ffad42'}
function pbConfig(){try{return JSON.parse(localStorage.getItem(PB_CFG)||'{}')}catch{return {}}}
async function connectPB(){
 const cfg=pbConfig();if(!cfg.url){updateSync('Локальное хранение','wait');return}
 try{pb=new PocketBase(cfg.url);pb.autoCancellation(false);updateSync('Подключение…','wait');
  try{pbRecord=await pb.collection(cfg.collection||'state').getOne('main');if(pbRecord.data?.version===2&&pbRecord.data?.apartments){state=pbRecord.data;extraPayments=state.extraPayments||[];localStorage.setItem(STORE,JSON.stringify(state));render()}else if(pbRecord.data?.apt69||pbRecord.data?.kirby){state=migrateLegacy({data:pbRecord.data,tariffs:pbRecord.tariffs,services:pbRecord.services,payments:pbRecord.payments,meters:pbRecord.meters,kirbyTariff:pbRecord.data?.kirbyTariff});persist()}}
  catch(e){if(e.status===404){pbRecord=await pb.collection(cfg.collection||'state').create({id:'main',data:state,tariffs:{},services:[],payments:{},meters:[],updatedAt:Date.now()})}else throw e}
  updateSync('Синхронизировано','ok');
  try{await pb.collection(cfg.collection||'state').subscribe('main',ev=>{if(ev.action==='update'&&ev.record.updatedAt>(pbRecord?.updatedAt||0)){pbRecord=ev.record;if(ev.record.data?.version===2){state=ev.record.data;extraPayments=state.extraPayments||[];localStorage.setItem(STORE,JSON.stringify(state));render();updateSync('Получены изменения','ok')}}})}catch(e){console.warn('Realtime unavailable',e)}
 }catch(e){console.error(e);updateSync('Ошибка PocketBase','error');toast('Не удалось подключиться к PocketBase')}
}
function scheduleSync(){const cfg=pbConfig();if(!cfg.url||!pb)return;clearTimeout(syncTimer);syncTimer=setTimeout(pushPB,700)}
async function pushPB(){if(!pb)return;const cfg=pbConfig();try{updateSync('Сохранение…','wait');const payload={data:state,tariffs:{},services:[],payments:{},meters:[],updatedAt:Date.now()};if(pbRecord)pbRecord=await pb.collection(cfg.collection||'state').update('main',payload);else pbRecord=await pb.collection(cfg.collection||'state').create(Object.assign({id:'main'},payload));updateSync('Синхронизировано','ok')}catch(e){console.error(e);updateSync('Ошибка записи','error')}}
function bind(){
 $('#side-nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)changeView(b.dataset.view)};
 $('#mobile-nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)changeView(b.dataset.view)};
 document.body.onclick=e=>{
  const go=e.target.closest('[data-go]');if(go)changeView(go.dataset.go);
  const edit=e.target.closest('.edit-payment');if(edit)paymentForm(edit.dataset.month);
  const editM=e.target.closest('.edit-meter');if(editM)addMeterForm(current().meters.find(x=>x.id===editM.dataset.id));
  const delM=e.target.closest('.delete-meter');if(delM&&confirm('Удалить прибор учёта?')){current().meters=current().meters.filter(x=>x.id!==delM.dataset.id);persist();render()}
  const editA=e.target.closest('.edit-apartment');if(editA)apartmentForm(state.apartments.find(x=>x.id===editA.dataset.id));
  const delA=e.target.closest('.delete-apartment');if(delA&&confirm('Удалить объект вместе с его историей?')){state.apartments=state.apartments.filter(x=>x.id!==delA.dataset.id);if(state.activeId===delA.dataset.id)state.activeId=state.apartments[0].id;persist();render()}
  const rm=e.target.closest('.remove-service');if(rm){current().services=current().services.filter(x=>x.id!==rm.dataset.id);persist();render()}
  const toggle=e.target.closest('.toggle-extra');if(toggle){const p=extraPayments.find(x=>x.id===toggle.dataset.id);p.paid=!p.paid;state.extraPayments=extraPayments;persist();render()}
 };
 $('#apartment-select').onchange=e=>{state.activeId=e.target.value;persist();render()};
 $('#reading-form').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));saveLocalReading(v)};
 $('#history-range').onchange=()=>renderHistory(current());
 $('#export-csv').onclick=exportCsv;$('#add-meter').onclick=()=>addMeterForm();$('#add-apartment').onclick=()=>apartmentForm();$('#add-service').onclick=addService;$('#add-extra-payment').onclick=extraPaymentForm;
 $('#tariffs-form').onsubmit=e=>{e.preventDefault();const a=current();new FormData(e.currentTarget).forEach((v,k)=>a.tariffs[k]=Number(v));persist();toast('Тарифы сохранены');render()};
 $('#services-list').onchange=renderServiceTotals;$('#services-list').oninput=e=>{if(e.target.matches('input'))renderServiceTotals()};
 $('#modal-close').onclick=closeModal;$('#modal-backdrop').onclick=e=>{if(e.target.id==='modal-backdrop')closeModal()};
 $('#sync-now').onclick=()=>pb?pushPB():connectPB();$('#settings-shortcut').onclick=()=>changeView('settings');
 $('#save-pb').onclick=async()=>{const url=$('#pb-url').value.trim().replace(/\/+$/,'');localStorage.setItem(PB_CFG,JSON.stringify({url,collection:$('#pb-collection').value.trim()||'state'}));await connectPB();if(pb)await pushPB()};
 $('#pb-url').value=pbConfig().url||'';$('#pb-collection').value=pbConfig().collection||'state';
 $('#backup-json').onclick=exportJson;$('#restore-json').onchange=e=>{if(e.target.files[0])importJson(e.target.files[0])};
 $('#reading-form').onreset=()=>setTimeout(()=>renderReadingForm(current()),0);
}
async function init(){await loadInitial();loadLegacyPayments();bind();render();connectPB();if(!$('#reading-month').value){const d=new Date();$('#reading-month').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}}
document.addEventListener('DOMContentLoaded',init);
})();
