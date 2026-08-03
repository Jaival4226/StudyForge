// frontend/src/components/SharedUI.jsx
import React from 'react';

export const EmptyState = ({ icon: Icon, title, message, actionText, onAction, actionColor = "bg-blue-600 hover:bg-blue-500" }) => (
  <div className="flex flex-col items-center justify-center h-full p-10 bg-surface-200 rounded-xl border border-surface-400 text-center w-full shadow-sm">
    <div className="bg-surface-300 p-4 rounded-xl mb-4 shadow-sm border border-surface-400">
      <Icon className="w-10 h-10 text-gray-400"/>
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-sm text-gray-400 mb-6 max-w-sm leading-relaxed">{message}</p>
    {actionText && onAction && (
      <button
        onClick={onAction}
        className={`px-6 py-2.5 ${actionColor} text-white font-bold rounded-xl transition-colors shadow-sm cursor-pointer`}
      >
        {actionText}
      </button>
    )}
  </div>
);

export const LoadingState = ({ message = "Processing..." }) => (
  <div className="flex flex-col w-full p-6 bg-surface-200 rounded-xl border border-surface-400 shadow-sm animate-pulse">
    <div className="flex items-center space-x-4 mb-4">
      <div className="w-10 h-10 bg-surface-400 rounded-xl shrink-0"></div>
      <div className="h-4 bg-surface-400 rounded-md w-1/3"></div>
    </div>
    <div className="space-y-3">
      <div className="h-3 bg-surface-400 rounded-md w-3/4"></div>
      <div className="h-3 bg-surface-400 rounded-md w-5/6"></div>
      <div className="h-3 bg-surface-400 rounded-md w-2/3"></div>
    </div>
    <div className="mt-6 text-xs font-mono text-gray-500 uppercase tracking-widest text-center">
      {message}
    </div>
  </div>
);