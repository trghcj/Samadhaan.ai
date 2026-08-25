import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userDepartment, setUserDepartment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleToSync = localStorage.getItem('signupRole') || 'citizen';
          const deptToSync = roleToSync === 'operator' ? localStorage.getItem('signupDepartment') : null;
          
          const response = await fetch('https://samadhaan-ai.onrender.com/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: user.uid,
              email: user.email || '',
              display_name: user.displayName || 'Unknown User',
              role: roleToSync,
              department: deptToSync
            })
          });
          const data = await response.json();
          setUserRole(data.role);
          if (data.department) setUserDepartment(data.department);
          
          localStorage.removeItem('signupRole');
          localStorage.removeItem('signupDepartment');
        } catch (err) {
          console.error("Failed to sync user to database", err);
          setUserRole('citizen'); // fallback
        }
      } else {
        setUserRole(null);
        setUserDepartment(null);
      }
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUserRole(null);
    setUserDepartment(null);
  };

  const value = {
    currentUser,
    userRole,
    userDepartment,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
