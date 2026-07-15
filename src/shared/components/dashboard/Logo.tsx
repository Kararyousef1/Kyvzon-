import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../core/stores';
import { getDefaultPathForRole } from '../../../router/constants';

/**
 * The main KYVZON logo component for the application.
 * Designed to be placed in the sidebar or header.
 * Clicking navigates the user to their role's default landing page.
 */
export function Logo() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleNavigateHome = () => {
    navigate(getDefaultPathForRole(user?.role));
  };

  return (
    <div className="py-6 px-4 text-center border-b border-slate-700/50">
      <button onClick={handleNavigateHome} className="inline-block" aria-label="Go to homepage">
        <div
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '1.25rem', // 20px
            fontWeight: 900,
            letterSpacing: '0.05em',
            background: 'linear-gradient(135deg, #ffffff 0%, #a78bfa 70%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 15px rgba(255,255,255,0.2)',
          }}
          className="transition-transform duration-300 ease-in-out hover:scale-105"
        >
           KYVZON
        </div>
      </button>
    </div>
  );
}
