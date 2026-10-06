import { writeFile, mkdir } from "node:fs/promises";
import { createDatabase } from "./database-harness.mjs";

// Offline introspection of the actual migrations, not manually maintained types.
// Replace with Supabase CLI generation after linking a project for relationship metadata.
const db = await createDatabase();
const enums = (await db.query(`select t.typname, array_agg(e.enumlabel order by e.enumsortorder) labels
from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' group by t.typname`)).rows;
const enumNames = new Set(enums.map(x=>x.typname));
function type(name) {
  if (enumNames.has(name)) return `Database["public"]["Enums"]["${name}"]`;
  if (['int2','int4','int8','numeric','float4','float8'].includes(name)) return 'number';
  if (name === 'bool') return 'boolean';
  if (['json','jsonb'].includes(name)) return 'Json';
  if (name === 'void') return 'undefined';
  return 'string';
}
const columns = (await db.query(`select table_name,column_name,udt_name,is_nullable,column_default
from information_schema.columns where table_schema='public' order by table_name,ordinal_position`)).rows;
let output = '// Generated from migrations by scripts/generate-foundation-types.mjs. Do not edit.\n';
output += 'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n';
output += 'export type Database = { public: { Tables: {\n';
for (const table of [...new Set(columns.map(x=>x.table_name))]) {
  const fields = columns.filter(x=>x.table_name===table);
  output += `  ${table}: {\n`;
  for (const mode of ['Row','Insert','Update']) {
    output += `    ${mode}: {\n`;
    for (const field of fields) {
      const optional = mode==='Update' || (mode==='Insert' && (field.column_default!==null || field.is_nullable==='YES'));
      output += `      ${field.column_name}${optional?'?':''}: ${type(field.udt_name)}${field.is_nullable==='YES'?' | null':''};\n`;
    }
    output += '    };\n';
  }
  output += '    Relationships: [];\n  };\n';
}
output += '}; Views: { [_ in never]: never }; Functions: {\n';
const functions = (await db.query(`select p.proname,p.proargnames,p.proargtypes::oid[] argtypes,p.prorettype::regtype::text return_type,
p.pronargdefaults from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows;
for(const fn of functions) {
  const args=[];
  for(let i=0;i<(fn.proargnames??[]).length;i++) {
    const foundType=(await db.query('select typname from pg_type where oid=$1',[fn.argtypes[i]])).rows[0];
    // PGlite may not expose every built-in/extension argument OID through pg_type.
    const t=foundType?.typname??'text';
    // PostgreSQL routine arguments accept SQL NULL; validators enforce required values.
    args.push(`${fn.proargnames[i]}${i>=fn.proargnames.length-fn.pronargdefaults?'?':''}: ${type(t)} | null`);
  }
  const returnType = ({integer:'number',boolean:'boolean',text:'string',uuid:'string',void:'undefined'})[fn.return_type] ?? type(fn.return_type.replace('public.',''));
  output += `${fn.proname}: { Args: { ${args.join('; ')} }; Returns: ${returnType} };\n`;
}
output += '}; Enums: {\n';
for(const e of enums) output += `${e.typname}: ${e.labels.map(x=>JSON.stringify(x)).join(' | ')};\n`;
output += '}; CompositeTypes: { [_ in never]: never }; }; };\n';
await mkdir('src/types',{recursive:true});
await writeFile('src/types/database.generated.ts',output);
await db.close();
console.log('Generated migration-derived database types.');
