export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100%',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #111111 50%, #0d0d0d 100%)',
        color: '#ffffff',
      }}
    >
      {children}
    </div>
  );
}
