export function demoServiceImage(name: string) {
  if (/beard|trim/i.test(name)) return "/images/service-beard.webp";
  if (/shav|towel|facial/i.test(name)) return "/images/service-shave.webp";
  return "/images/service-cut.webp";
}
