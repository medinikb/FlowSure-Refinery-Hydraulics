/** Lets TypeScript recognise raster image files used by the application UI. */
declare module "*.png" {
  const source: string;
  export default source;
}
