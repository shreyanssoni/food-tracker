declare module 'web-push' {
  // Minimal declaration to satisfy TypeScript in environments without @types/web-push
  // You can replace this by installing: npm i -D @types/web-push
  const webpush: any;
  export default webpush;
}
