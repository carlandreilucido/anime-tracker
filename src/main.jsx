import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ProfileProvider } from './contexts/ProfileContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { PwaProvider } from './contexts/PwaContext'
import './styles.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><PwaProvider><AuthProvider><ProfileProvider><ThemeProvider><App /></ThemeProvider></ProfileProvider></AuthProvider></PwaProvider></BrowserRouter></React.StrictMode>)
