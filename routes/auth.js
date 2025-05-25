import { useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';

const AuthPage = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    const handleLineLoginCallback = async () => {
      if (!code || !state) {
        console.error('Missing code or state in URL');
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: 'ไม่พบ code หรือ state ใน URL',
        });
        return;
      }

      try {
        const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/line/callback`, { code });
        const { userId } = response.data;
        console.log('LINE User ID received and stored:', userId); // Debug
        localStorage.setItem('lineUserId', userId);
        window.location.href = '/booking';
      } catch (error) {
        console.error('LINE callback error:', error.response?.data || error.message);
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: 'ไม่สามารถล็อกอินด้วย LINE ได้',
        });
      }
    };

    if (window.location.pathname === '/auth/line/callback') {
      handleLineLoginCallback();
    }
  }, []);

  const handleLineLogin = () => {
    const clientId = process.env.REACT_APP_LINE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/line/callback`;
    const state = Math.random().toString(36).substring(2); // Random state สำหรับความปลอดภัย
    const scope = 'profile openid';
    const lineLoginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    console.log('Redirecting to LINE Login:', lineLoginUrl);
    window.location.href = lineLoginUrl;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">ล็อกอินด้วย LINE</h1>
      <button
        onClick={handleLineLogin}
        className="bg-green-500 text-white p-2 rounded"
      >
        ล็อกอินด้วย LINE
      </button>
    </div>
  );
};

export default AuthPage;