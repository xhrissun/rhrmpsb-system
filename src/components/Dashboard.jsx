import React, { useState, useEffect } from 'react';
import RaterView from './RaterView';
import SecretariatView from './SecretariatView';
import AdminView from './AdminView';
import { USER_TYPES } from '../utils/constants';
import { usersAPI } from '../utils/api';

// Password Change Modal Component
const PasswordChangeModal = ({ isOpen, onClose, selectedUser, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword.trim()) {
      setError('New password is required');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const result = await usersAPI.changePassword(selectedUser._id, newPassword);
      onSuccess(result.message);
      handleClose();
    } catch (error) {
      console.error('Password change error:', error);
      setError(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setShowPasswords(false);
    onClose();
  };

  if (!isOpen || !selectedUser) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Change Password
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-medium">User:</span> {selectedUser.name}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Email:</span> {selectedUser.email}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Role:</span> {selectedUser.userType}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter new password"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Confirm new password"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="showPasswords"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="showPasswords" className="ml-2 block text-sm text-gray-600">
              Show passwords
            </label>
          </div>

          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
            <p className="font-medium mb-1">Password Requirements:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>At least 6 characters long</li>
              <li>User will need to log in again with the new password</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Creator Profile Modal Component
const CreatorProfileModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800 text-center flex-1">
            About the Developer
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-center space-y-4">
          <img
            src="https://github.com/xhrissun/rhrmpsb-system/blob/main/profile.jpg?raw=true"
            alt="Creator Photo"
            className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-gray-200 shadow-sm"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjY0IiBjeT0iNDQiIHI9IjIwIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiA5NkMzMiA4MC41MzYgNDQuNTM2IDY4IDYwIDY4aDhDODMuNDY0IDY4IDk2IDgwLjUzNiA5NiA5NnYzMkgzMlY5NloiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
            }}
          />
          
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Dan Christian Bonacua Sabao, LPT, CHRM
            </h2>
            <p className="text-blue-600 font-medium text-sm">
              Administrative Officer I | DENR IV-A
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-center items-center">
              <span className="mr-2 text-lg">📧</span>
              <a
                href="mailto:dan.c.b.sabao.adm@gmail.com"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                dan.c.b.sabao.adm@gmail.com
              </a>
            </div>

            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-800 text-sm mb-2">Support My Work</h4>
              <div className="space-y-1 text-sm">
                <p><strong>PayMaya:</strong> @vlax</p>
                <p>
                  <strong>PayPal:</strong>{' '}
                  <a
                    href="https://paypal.me/tetralax"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    paypal.me/tetralax
                  </a>
                </p>
              </div>
            </div>

            <p className="text-gray-600 text-sm leading-relaxed">
              Developer of the <strong>DENR CALABARZON Competency Rating System</strong>, leveraging expertise in VBA, JavaScript, and systems integration to deliver efficient, user-friendly digital solutions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// User Selection Modal Component
const UserSelectionModal = ({ isOpen, onClose, users, onSelectUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleClose = () => {
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Select User
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search users by name, email, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user._id}
                onClick={() => {
                  onSelectUser(user);
                  handleClose();
                }}
                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-800">
                      {user.userType}
                    </div>
                    {user.raterType && (
                      <div className="text-xs text-gray-500">
                        {user.raterType}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No users found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ user, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [userSelectionModal, setUserSelectionModal] = useState(false);
  const [passwordChangeModal, setPasswordChangeModal] = useState({
    isOpen: false,
    user: null
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [creatorModalOpen, setCreatorModalOpen] = useState(false);

  useEffect(() => {
    if (user.userType === USER_TYPES.ADMIN) {
      fetchUsers();
    }
  }, [user.userType]);

  const fetchUsers = async () => {
    try {
      const userData = await usersAPI.getAll();
      setUsers(userData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(`rater_${user._id}_selectedAssignment`);
    localStorage.removeItem(`rater_${user._id}_selectedPosition`);
    localStorage.removeItem(`rater_${user._id}_selectedItemNumber`);
    localStorage.removeItem(`rater_${user._id}_selectedCandidate`);
    localStorage.removeItem(`secretariat_${user._id}_selectedAssignment`);
    localStorage.removeItem(`secretariat_${user._id}_selectedPosition`);
    localStorage.removeItem(`secretariat_${user._id}_selectedItemNumber`);
    localStorage.removeItem(`secretariat_${user._id}_selectedCandidate`);
    localStorage.removeItem(`admin_${user._id}_activeTab`);
    onLogout();
  };

  const handleOpenUserSelection = () => {
    setUserSelectionModal(true);
  };

  const handleCloseUserSelection = () => {
    setUserSelectionModal(false);
  };

  const handleSelectUser = (selectedUser) => {
    setPasswordChangeModal({
      isOpen: true,
      user: selectedUser
    });
  };

  const handleClosePasswordModal = () => {
    setPasswordChangeModal({
      isOpen: false,
      user: null
    });
  };

  const handlePasswordChangeSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  const renderContent = () => {
    switch (user.userType) {
      case USER_TYPES.RATER:
        return <RaterView user={user} />;
      case USER_TYPES.SECRETARIAT:
        return <SecretariatView user={user} />;
      case USER_TYPES.ADMIN:
        return <AdminView user={user} />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
              <p className="text-gray-600">Invalid user type</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="navbar">
        <div className="navbar-title-container">
          <img
            src="https://github.com/xhrissun/rhrmpsb-system/blob/main/denr-logo.png?raw=true"
            alt="DENR Logo"
            className="w-8 h-8 mr-2 object-contain" // Reduced logo size
            onError={(e) => {
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+Cjwvc3ZnPg==';
            }}
          />
          <h1 className="navbar-title">The DENR CALABARZON Competency Rating System</h1>
          <span className="navbar-user-type">
            {user.userType.charAt(0).toUpperCase() + user.userType.slice(1)}
          </span>
        </div>
        <div className="navbar-buttons">
          <span className="navbar-welcome">
            {user.name}
          </span>
          <button
            onClick={() => setCreatorModalOpen(true)}
            className="navbar-button bg-blue-600 text-white hover:bg-blue-700"
            title="About the Developer"
          >
            About
          </button>
          {user.userType === USER_TYPES.ADMIN && (
            <button
              onClick={handleOpenUserSelection}
              className="navbar-button bg-orange-600 text-white hover:bg-orange-700"
              title="Change user password"
            >
              Password
            </button>
          )}
          <button
            onClick={handleLogout}
            className="navbar-button btn-secondary"
          >
            Logout
          </button>
        </div>
      </nav>

      {successMessage && (
        <div className="mx-6 mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <svg className="flex-shrink-0 h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 adviser16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-green-700 font-medium">
                {successMessage}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setSuccessMessage('')}
                  className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="p-6">
        {renderContent()}
      </main>

      <CreatorProfileModal
        isOpen={creatorModalOpen}
        onClose={() => setCreatorModalOpen(false)}
      />

      <UserSelectionModal
        isOpen={userSelectionModal}
        onClose={handleCloseUserSelection}
        users={users}
        onSelectUser={handleSelectUser}
      />

      <PasswordChangeModal
        isOpen={passwordChangeModal.isOpen}
        onClose={handleClosePasswordModal}
        selectedUser={passwordChangeModal.user}
        onSuccess={handlePasswordChangeSuccess}
      />
    </div>
  );
};

export default Dashboard;