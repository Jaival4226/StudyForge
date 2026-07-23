// src/Login.jsx
import React, { useState } from 'react';
import { Lock, User, UserPlus, LogIn } from 'lucide-react';

export default function Login({ setToken }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    // Choose the endpoint based on whether they are logging in or signing up
    const endpoint = isRegistering ? 'http://127.0.0.1:8000/api/register/' : 'http://127.0.0.1:8000/api/login/';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('auth_token', data.token);
        setToken(data.token);
      } else {
        setError(data.error || 'Authentication failed.');
      }
    } catch (err) {
      setError('Network error. Is the Django server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 items-center justify-center font-sans">
      <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-2xl w-full max-w-md">
        
        <div className="flex justify-center mb-6">
          <div className="bg-blue-600 p-3 rounded-xl text-white">
            {isRegistering ? <UserPlus className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-center text-white mb-2">
          {isRegistering ? 'Create an Account' : 'Welcome Back'}
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">
          {isRegistering ? 'Sign up to generate your private AI workspace.' : 'Enter your credentials to access your workspaces.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm text-center font-medium">{error}</div>}
          
          <div className="relative">
            <User className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Username"
            />
          </div>

          <div className="relative">
            <Lock className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isRegistering ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
            <span>{loading ? 'Processing...' : (isRegistering ? 'Sign Up' : 'Sign In')}</span>
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}