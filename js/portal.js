// COPRA Wholesale Portal — portal.js
// Auth, data loading, all UI rendering

// SECURE PORTAL CONFIG
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkb3B4Zmp6d3h5Y3RxZGJ6YWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NTMyMTQsImV4cCI6MjA5NzUyOTIxNH0.55wDddJZ6g5_jM-o8UhYb0yvJ2xMKKyZ-FzFFC7F0qI';
const FN_BASE = 'https://edopxfjzwxyctqdbzagr.supabase.co/functions/v1';
const SK = 'copra_portal_session_v1';
let CUSTOMER=null,SESSION_TOKEN=null,ORDER_VARIANT=null;
let DB={products:[],variants:[],sales:[],reservations:[]};

async function callPortal(action,body){
  const headers={'Content-Type':'application/json','apikey':SB_ANON};
  if(SESSION_TOKEN)headers['Authorization']='Bearer '+SESSION_TOKEN;
  const res=await fetch(FN_BASE+'/portal-api',{method:'POST',headers,body:JSON.stringify({action,...body})});
  if(!res.ok){const e=await res.json().catch(()=>({error:res.statusText}));throw new Error(e.error||res.statusText);}
  return res.json();
}

const nisF=n=>'NIS '+(+n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
const dF=d=>{if(!d)return'--';try{return new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}catch(e){return d;}};
const uid=()=>'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

async function doPortalLogin(){
  const username=(document.getElementById('login-username').value||'').trim().toLowerCase();
  const password=document.getElementById('login-pin').value;
  const errEl=document.getElementById('login-err');
  if(!username||!password){errEl.textContent='Enter username and password.';return;}
  errEl.textContent='Signing in...';
  try{
    const res=await fetch(FN_BASE+'/auth-login',{method:'POST',
      headers:{'Content-Type':'application/json','apikey':SB_ANON},
      body:JSON.stringify({username,password,type:'portal'})});
    const data=await res.json();
    if(!data.token){errEl.textContent='Incorrect username or password.';document.getElementById('login-pin').value='';return;}
    SESSION_TOKEN=data.token;CUSTOMER=data.customer;
    sessionStorage.setItem(SK,JSON.stringify({token:data.token,customer:data.customer}));
    await loadPortalData();showApp();
  }catch(e){errEl.textContent='Login failed: '+e.message;}
}

function showApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-shell').style.display='flex';
  document.getElementById('app-shell').style.flexDirection='column';
  document.getElementById('welcome-name').textContent=CUSTOMER.name;
  renderOverview();renderCatalog();renderOrders();renderAccount();
}

function doLogout(){
  sessionStorage.removeItem(SK);SESSION_TOKEN=null;CUSTOMER=null;
  document.getElementById('app-shell').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('login-pin').value='';
  document.getElementById('login-username').value='';
  document.getElementById('login-err').textContent='';
}

async function loadPortalData(){
  const data=await callPortal('read',{});
  DB.products=data.products||[];DB.variants=data.variants||[];
  DB.sales=data.sales||[];DB.reservations=data.reservations||[];
  if(data.customer)CUSTOMER={...CUSTOMER,...data.customer};
}

async function switchTab(tab){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('pg-'+tab).classList.add('active');
  await loadPortalData();
  if(tab==='overview')renderOverview();
  if(tab==='catalog')renderCatalog();
  if(tab==='orders')renderOrders();
  if(tab==='account')renderAccount();
}

function renderOverview(){
  const sales=(DB.sales||[]).filter(s=>!s.is_return);
  const totalSpend=sales.reduce((a,s)=>a+(+s.unit_price||0)*(+s.qty||1),0);
  const outstanding=sales.filter(s=>s.payment_status!=='Collected'&&s.payment_status!=='Paid').reduce((a,s)=>a+(+s.unit_price||0)*(+s.qty||1),0);
  document.getElementById('stat-orders').textContent=sales.length;
  document.getElementById('stat-spend').textContent=nisF(totalSpend);
  document.getElementById('stat-balance').textContent=nisF(outstanding);
  document.getElementById('stat-credit').textContent=nisF(CUSTOMER.credit_limit||0);
  const recent=(DB.sales||[]).slice(0,8);
  const el=document.getElementById('recent-orders-list');
  if(!recent.length){el.innerHTML='<div class="empty">No orders yet.</div>';return;}
  el.innerHTML='<div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead><tbody>'+
    recent.map(s=>'<tr><td>'+dF(s.date)+'</td><td>'+(s.product_name||'--')+' <span style="font-size:11px;color:#64748B">'+(s.variant_label||'')+'</span></td><td>'+s.qty+'</td><td>'+nisF((+s.unit_price||0)*(+s.qty||1))+'</td><td><span class="badge '+(s.payment_status==='Collected'||s.payment_status==='Paid'?'badge-gn':s.payment_status==='Credit'?'badge-or':'badge-bl')+'">'+(s.payment_status||'--')+'</span></td></tr>').join('')+'</tbody></table></div>';
}

function filterModels(){
  const make=document.getElementById('cat-make').value;
  const modelSel=document.getElementById('cat-model');
  const models=[...new Set(DB.variants.filter(v=>!make||v.car_make===make).map(v=>v.car_model).filter(Boolean))].sort();
  modelSel.innerHTML='<option value="">All Models</option>'+models.map(m=>'<option>'+m+'</option>').join('');
  renderCatalog();
}

function renderCatalog(){
  const search=(document.getElementById('cat-search').value||'').toLowerCase();
  const make=document.getElementById('cat-make').value;
  const model=document.getElementById('cat-model').value;
  const disc=+CUSTOMER.discount_pct||0;
  const makesSel=document.getElementById('cat-make');
  if(makesSel.options.length<=1){[...new Set(DB.variants.map(v=>v.car_make).filter(Boolean))].sort().forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;makesSel.appendChild(o);});}
  let variants=(DB.variants||[]).filter(v=>(+v.stock_qty||0)>0);
  if(make)variants=variants.filter(v=>v.car_make===make);
  if(model)variants=variants.filter(v=>v.car_model===model);
  if(search)variants=variants.filter(v=>{const p=DB.products.find(p=>p.id===v.product_id);return(p&&p.name||''+v.car_make+v.car_model+v.set_type).toLowerCase().includes(search);});
  const grid=document.getElementById('prod-grid');
  if(!variants.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1">No products found.</div>';return;}
  grid.innerHTML=variants.map(v=>{
    const p=DB.products.find(p=>p.id===v.product_id);
    const price=(+v.wholesale||+v.retail||0)*(disc>0?1-disc/100:1);
    return '<div class="prod-card"><h3>'+(p&&p.name||'Product')+'</h3><div class="meta">'+[v.car_make,v.car_model,v.year_from&&v.year_to?v.year_from+'-'+v.year_to:'',v.set_type].filter(Boolean).join(' - ')+'</div><div class="price">'+nisF(price)+(disc>0?' <span style="font-size:11px;color:#16A34A">(-'+disc+'%)</span>':'')+'</div><div class="stock">In stock: '+v.stock_qty+'</div><button class="btn-order" data-vid="'+v.id+'" onclick="openOrder(this.dataset.vid)">Order Now</button></div>';
  }).join('');
}

function renderOrders(){
  const el=document.getElementById('orders-list');
  const reservations=DB.reservations||[];const sales=DB.sales||[];
  let html='';
  if(reservations.length)html+='<h3 style="font-size:13px;font-weight:700;color:#1B2A4A;margin-bottom:10px">Order Requests ('+reservations.length+')</h3><div style="overflow-x:auto;margin-bottom:20px"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Notes</th><th>Status</th></tr></thead><tbody>'+reservations.map(r=>{const v=DB.variants.find(x=>x.id===r.variant_id);const p=DB.products.find(x=>x.id===r.product_id);const label=v?[v.car_make,v.car_model,v.set_type].filter(Boolean).join(' '):'--';return'<tr><td>'+dF(r.date)+'</td><td>'+(p&&p.name||'--')+' <span style="font-size:11px;color:#64748B">'+label+'</span></td><td>'+r.qty+'</td><td style="font-size:11px">'+(r.notes||'--')+'</td><td><span class="badge '+(r.status==='Confirmed'?'badge-gn':r.status==='Rejected'?'badge-rd':'badge-or')+'">'+(r.status||'Pending')+'</span></td></tr>';}).join('')+'</tbody></table></div>';
  if(sales.length)html+='<h3 style="font-size:13px;font-weight:700;color:#1B2A4A;margin-bottom:10px">Sales History ('+sales.length+')</h3><div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Product</th><th>Variant</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead><tbody>'+sales.map(s=>'<tr><td>'+dF(s.date)+'</td><td>'+(s.product_name||'--')+'</td><td style="font-size:11px;color:#64748B">'+(s.variant_label||'--')+'</td><td>'+s.qty+'</td><td>'+nisF((+s.unit_price||0)*(+s.qty||1))+'</td><td><span class="badge '+(s.payment_status==='Collected'||s.payment_status==='Paid'?'badge-gn':s.payment_status==='Credit'?'badge-or':'badge-bl')+'">'+(s.payment_status||'--')+'</span></td></tr>').join('')+'</tbody></table></div>';
  if(!html)html='<div class="empty">No orders yet.</div>';
  el.innerHTML=html;
}

function renderAccount(){
  const el=document.getElementById('account-details');
  const outstanding=(DB.sales||[]).filter(s=>!s.is_return&&s.payment_status!=='Collected'&&s.payment_status!=='Paid').reduce((a,s)=>a+(+s.unit_price||0)*(+s.qty||1),0);
  el.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px"><div><div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px">Company</div><div style="font-weight:600">'+(CUSTOMER.name||'--')+'</div></div><div><div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px">Discount</div><div style="font-weight:600;color:#16A34A">'+(CUSTOMER.discount_pct||0)+'%</div></div><div><div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px">Credit Limit</div><div style="font-weight:600">'+nisF(CUSTOMER.credit_limit||0)+'</div></div><div><div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px">Outstanding</div><div style="font-weight:600;color:'+(outstanding>0?'#DC2626':'#16A34A')+'">'+nisF(outstanding)+'</div></div></div>';
}

function openOrder(variantId){
  const v=DB.variants.find(x=>x.id===variantId);if(!v)return;
  const p=DB.products.find(x=>x.id===v.product_id);
  const disc=+CUSTOMER.discount_pct||0;
  const price=(+v.wholesale||+v.retail||0)*(1-disc/100);
  ORDER_VARIANT={variant:v,product:p,price};
  document.getElementById('order-modal-title').textContent=p&&p.name||'Place Order';
  document.getElementById('order-product-info').textContent=[v.car_make,v.car_model,v.year_from&&v.year_to?v.year_from+'-'+v.year_to:'',v.set_type].filter(Boolean).join(' - ');
  document.getElementById('order-price').textContent=nisF(price)+(disc>0?' ('+disc+'% discount applied)':'');
  document.getElementById('order-qty').value=1;document.getElementById('order-notes').value='';
  updateOrderTotal();document.getElementById('m-order').classList.add('open');
}
function updateOrderTotal(){if(!ORDER_VARIANT)return;document.getElementById('order-total').textContent=nisF(ORDER_VARIANT.price*(+document.getElementById('order-qty').value||1));}
function closeOrder(){document.getElementById('m-order').classList.remove('open');ORDER_VARIANT=null;}

async function submitOrder(){
  if(!ORDER_VARIANT)return;
  const qty=+document.getElementById('order-qty').value||1;
  const notes=document.getElementById('order-notes').value;
  if(qty<1){alert('Enter a valid quantity.');return;}
  const btn=document.querySelector('#m-order .btn-p');if(btn)btn.disabled=true;
  try{
    await callPortal('submit_order',{reservation:{id:uid(),customer_id:CUSTOMER.customer_id,customer_name:CUSTOMER.name,product_id:ORDER_VARIANT.variant.product_id,variant_id:ORDER_VARIANT.variant.id,qty,date:new Date().toISOString().split('T')[0],status:'Pending',notes}});
    closeOrder();alert('Order submitted. Our team will contact you to confirm.');
    await loadPortalData();renderOverview();renderOrders();
  }catch(e){if(btn)btn.disabled=false;alert(e.message);}
}

async function changePortalPassword(){
  const np=document.getElementById('new-pw').value;
  const cp=document.getElementById('conf-pw').value;
  const msg=document.getElementById('pw-msg');
  if(np.length<4){msg.style.color='#DC2626';msg.textContent='Min 4 characters.';return;}
  if(np!==cp){msg.style.color='#DC2626';msg.textContent='Passwords do not match.';return;}
  try{
    await callPortal('change_password',{new_password:np});
    msg.style.color='#16A34A';msg.textContent='Password updated!';
    document.getElementById('new-pw').value='';document.getElementById('conf-pw').value='';
    setTimeout(()=>msg.textContent='',3000);
  }catch(e){msg.style.color='#DC2626';msg.textContent='Error: '+e.message;}
}

async function init(){
  const s=sessionStorage.getItem(SK);
  if(s){try{const sess=JSON.parse(s);SESSION_TOKEN=sess.token;CUSTOMER=sess.customer;await loadPortalData();showApp();return;}catch(e){sessionStorage.removeItem(SK);}}
  document.getElementById('login-screen').style.display='flex';
  setTimeout(()=>document.getElementById('login-username').focus(),100);
}
document.addEventListener('DOMContentLoaded',init);

