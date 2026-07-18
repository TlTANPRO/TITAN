import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-text-primary mb-2">404</h1>
        <p className="text-text-muted mb-6">Halaman tidak ditemukan.</p>
        <Link to="/" className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors">
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}
