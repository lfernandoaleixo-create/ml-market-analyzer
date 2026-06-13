import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query("SELECT accessToken, mlUserId FROM ml_credentials WHERE accessToken IS NOT NULL LIMIT 1");
await conn.end();
const c=rows[0]; const token=c.accessToken; const uid=c.mlUserId;
const API="https://api.mercadolibre.com";
async function get(p){const t=Date.now();const r=await fetch(API+p,{headers:{Authorization:`Bearer ${token}`}});return{status:r.status,ms:Date.now()-t,json:r.ok?await r.json():null};}
let me=await get(`/users/me`); console.log("users/me:", `(${me.ms}ms ${me.status})`, "nick:", me.json?.nickname);
let it=await get(`/users/${uid}/items/search?limit=1`); console.log("itens total:", it.json?.paging?.total, `(${it.ms}ms ${it.status})`);
let op=await get(`/orders/search?seller=${uid}&order.status=paid&limit=1`); console.log("pedidos pagos:", op.json?.paging?.total, `(${op.ms}ms ${op.status})`);
