// V21: 404 NotFound page with custom illustration + back link.
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg-primary">
      <div className="max-w-md text-center">
        <div className="text-8xl font-bold text-accent-primary/20 leading-none">404</div>
        <h1 className="text-2xl font-bold text-text-primary mt-4">Halaman tidak ditemukan</h1>
        <p className="text-sm text-text-muted mt-2">
          URL yang kamu akses tidak ada. Mungkin sudah dihapus atau pernah ada tapi sekarang hilang.
        </p>
        <div className="flex items-center justify-center gap-2 mt-6">
          <Link
            to="/"
            className="btn-primary !px-4 !py-2 text-sm flex items-center gap-1.5"
          >
            <Home className="w-4 h-4" />
            Kembali ke Home
          </Link>
        </div>
      </div>
    </div>
  );
}
