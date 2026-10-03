import {z} from "zod";
export const slug=z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/,"Use lowercase words separated by hyphens.");
export const optionalId=z.union([z.literal(""),z.uuid()]);
export const categorySchema=z.object({id:optionalId,name:z.string().trim().min(1).max(200),slug,sort_order:z.coerce.number().int().min(0).max(10000),active:z.boolean(),published:z.boolean()});
export const serviceSchema=z.object({id:optionalId,name:z.string().trim().min(1).max(200),slug,category_id:optionalId,description:z.string().trim().max(4000),price:z.string(),duration_minutes:z.coerce.number().int().min(1).max(1440),buffer_before_minutes:z.coerce.number().int().min(0).max(240),buffer_after_minutes:z.coerce.number().int().min(0).max(240),payment_mode:z.enum(["PAY_AT_BUSINESS","DEPOSIT","FULL_PAYMENT"]),deposit_type:z.enum(["FIXED","PERCENTAGE"]),deposit:z.string(),active:z.boolean(),published:z.boolean()});
export const staffSchema=z.object({id:optionalId,full_name:z.string().trim().min(2).max(200),display_name:z.string().trim().min(2).max(200),slug,bio:z.string().trim().max(2000),email:z.union([z.literal(""),z.email().max(254)]),phone:z.string().trim().max(40).regex(/^[+\d ()-]*$/),active:z.boolean(),published:z.boolean(),bookable:z.boolean()});
export const exceptionSchema=z.object({staff_id:z.uuid(),kind:z.enum(["UNAVAILABLE","EXTRA_HOURS"]),start:z.iso.datetime({local:true}),end:z.iso.datetime({local:true}),reason:z.string().trim().min(1).max(500)}).refine(v=>v.start<v.end,{path:["end"],message:"End must be after start."});
export const catalogFilters=z.object({q:z.string().trim().max(100).default(""),category:optionalId.default(""),active:z.enum(["","true","false"]).default(""),page:z.coerce.number().int().min(1).max(10000).default(1)});
export function currencyDigits(currency:string){return new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits??2;}
export function decimalToInteger(value:string,digits:number){
  if(!/^\d+(\.\d+)?$/.test(value)||value.length>24)throw new Error("Enter a non-negative amount without separators.");
  const [whole,fraction=""]=value.split(".");if(fraction.length>digits)throw new Error(`Use no more than ${digits} decimal places.`);
  const amount=BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,"0")||"0");
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Amount is too large.");return Number(amount);
}
export function minorToInput(amount:number,currency:string){const digits=currencyDigits(currency);const s=BigInt(amount).toString().padStart(digits+1,"0");return digits?`${s.slice(0,-digits)}.${s.slice(-digits)}`:s;}
export function serviceValues(v:z.infer<typeof serviceSchema>,currency:string){
  const price_amount=decimalToInteger(v.price,currencyDigits(currency));
  let deposit_amount=0,deposit_percent_bps:number|null=null;
  if(v.payment_mode==="FULL_PAYMENT"&&price_amount===0)throw new Error("Full payment requires a positive price.");
  if(v.payment_mode==="DEPOSIT"){
    if(v.deposit_type==="PERCENTAGE"){
      deposit_percent_bps=decimalToInteger(v.deposit,2);
      if(deposit_percent_bps<1||deposit_percent_bps>10000)throw new Error("Percentage must be between 0.01 and 100.");
      deposit_amount=Number((BigInt(price_amount)*BigInt(deposit_percent_bps)+9999n)/10000n);
    }else deposit_amount=decimalToInteger(v.deposit,currencyDigits(currency));
    if(deposit_amount<1||deposit_amount>price_amount)throw new Error("Deposit must be positive and cannot exceed the price.");
  }
  const {id,price,deposit,...rest}=v;void id;void price;void deposit;
  return {...rest,price_amount,deposit_amount,deposit_percent_bps,deposit_type:v.payment_mode==="DEPOSIT"?v.deposit_type:"FIXED"};
}
