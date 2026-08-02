import React, { useState } from 'react';

export default function Login({ setToken }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const url = isLogin 
      ? 'http://localhost:8000/api/login/' 
      : 'http://localhost:8000/api/register/';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      
      if (response.ok && data.token) {
        localStorage.setItem('auth_token', data.token);
        setToken(data.token);
      } else {
        setError(data.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Is the backend running?');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-100 font-sans">
      <div className="max-w-md w-full bg-surface-200 p-8 rounded-xl border border-surface-400 shadow-sm">
        
        <div className="flex justify-center mb-6">
           <div className="bg-blue-600 p-3 rounded-xl font-bold text-white tracking-wider shadow-sm text-2xl">AC</div>
        </div>
        <h2 className="text-2xl font-bold text-white text-center mb-8">
            {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>

        {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-200 px-4 py-3 rounded-md mb-6 text-sm">
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface-300 text-white px-4 py-3 rounded-md border border-surface-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-300 text-white px-4 py-3 rounded-md border border-surface-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-sm"
          >
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-8 text-center">
            <button 
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
        </div>
      </div>
    </div>
  );
}