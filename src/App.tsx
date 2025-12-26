import { useState, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Trash2,
  Table,
  AlertCircle,
  CheckCircle,
  Info,
  X,
  Eye,
  Save,
  FolderOpen,
  LogOut,
  User,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { supabase, SavedPivotRow } from './lib/supabase'
import './App.css'

// Types
interface HoldingData {
  companyName: string
  total: number
  ownerName: string
}

interface PivotData {
  [companyName: string]: {
    [ownerName: string]: number
    'Total Holdings': number
  }
}

interface SavedPivot {
  id: string
  name: string
  data: PivotData
  created_at: string
}

// Extract owner name from filename
const extractOwnerFromFilename = (filename: string): string => {
  const match = filename.match(/CLIENT\s*([^-|_]+?)\s*CLIENT-ID/i)
  if (match) {
    return match[1].trim().replace(/_/g, ' ').replace(/-/g, ' ')
  }
  return filename.replace(/\.(xlsx|csv)$/i, '')
}

function App() {
  const { user, loading, isConfigured, signInWithGoogle, signOut } = useAuth()
  
  // State
  const [files, setFiles] = useState<File[]>([])
  const [allData, setAllData] = useState<HoldingData[]>([])
  const [pivotData, setPivotData] = useState<PivotData | null>(null)
  const [savedPivots, setSavedPivots] = useState<SavedPivot[]>([])
  const [selectedSavedPivot, setSelectedSavedPivot] = useState<string>('')
  const [loadedPivot, setLoadedPivot] = useState<PivotData | null>(null)
  const [alerts, setAlerts] = useState<{type: 'success' | 'error' | 'warning' | 'info', message: string}[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [viewFile, setViewFile] = useState<File | null>(null)
  const [viewedPivot, setViewedPivot] = useState<PivotData | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingPivots, setIsLoadingPivots] = useState(false)
  const [debugPreview, setDebugPreview] = useState<{filename: string, rows: unknown[][]} | null>(null)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  // Add alert
  const addAlert = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setAlerts(prev => [...prev, { type, message }])
    setTimeout(() => {
      setAlerts(prev => prev.filter((_, i) => i !== 0))
    }, 5000)
  }

  // Fetch saved pivots from Supabase
  const fetchSavedPivots = useCallback(async () => {
    if (!user) return
    
    setIsLoadingPivots(true)
    try {
      const { data, error } = await supabase
        .from('saved_pivots')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      setSavedPivots((data as SavedPivotRow[]).map(row => ({
        id: row.id,
        name: row.name,
        data: row.data as PivotData,
        created_at: row.created_at
      })))
    } catch (error) {
      console.error('Error fetching pivots:', error)
      addAlert('error', 'Failed to load saved pivots')
    } finally {
      setIsLoadingPivots(false)
    }
  }, [user])

  // Load saved pivots when user logs in
  useEffect(() => {
    if (user) {
      fetchSavedPivots()
    } else {
      setSavedPivots([])
    }
  }, [user, fetchSavedPivots])

  // Handle Google login
  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle()
    } catch {
      addAlert('error', 'Failed to sign in with Google')
    }
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut()
      // Clear local state
      setFiles([])
      setAllData([])
      setPivotData(null)
      setSavedPivots([])
      setLoadedPivot(null)
      setViewedPivot(null)
      addAlert('info', 'Signed out successfully')
    } catch {
      addAlert('error', 'Failed to sign out')
    }
  }

  // Process uploaded files
  const processFiles = useCallback(async (uploadedFiles: File[]) => {
    const newData: HoldingData[] = []
    
    for (const file of uploadedFiles) {
      const ownerName = extractOwnerFromFilename(file.name)
      console.log(`Processing file: ${file.name}, Owner extracted: ${ownerName}`)
      
      try {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // First, let's see what the raw data looks like
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]
        console.log(`File ${file.name} - Total rows: ${rawData.length}`)
        console.log('First 10 rows:', rawData.slice(0, 10))
        
        // Auto-detect format: look for first row with ISIN code (INE...) or numeric data pattern
        let dataStartRow = -1
        let companyColIndex = 1  // Default: company name in column 1
        let totalColIndex = 9    // Default: total in column 9
        
        for (let i = 0; i < Math.min(15, rawData.length); i++) {
          const row = rawData[i]
          if (!row || row.length < 3) continue
          
          // Check if this row looks like data (has ISIN code or looks like holding data)
          const firstCell = String(row[0] || '').trim()
          const hasISIN = /^INE[A-Z0-9]+$/i.test(firstCell) || /^[A-Z]{2}[A-Z0-9]+$/i.test(firstCell)
          const hasNumericData = row.length >= 10 && typeof row[2] === 'number' && typeof row[9] === 'number'
          
          if (hasISIN || hasNumericData) {
            dataStartRow = i
            console.log(`Found data starting at row ${i}`)
            break
          }
          
          // Also check for header row with column names
          for (let j = 0; j < row.length; j++) {
            const cellValue = String(row[j] || '').toLowerCase().trim()
            if (cellValue.includes('company') || cellValue.includes('scrip') || cellValue.includes('name of security') || cellValue.includes('security name')) {
              companyColIndex = j
              dataStartRow = i + 1  // Data starts after header
              console.log(`Found header row at ${i}, company col: ${j}`)
            }
            if (cellValue === 'total' || cellValue === 'free' || cellValue.includes('total qty') || cellValue.includes('quantity') || cellValue.includes('holding')) {
              totalColIndex = j
            }
          }
        }
        
        // If still not found, default to row 5
        if (dataStartRow < 0) {
          dataStartRow = 5
          console.log('Using default: data starts at row 5')
        }
        
        console.log(`Detected - Data start row: ${dataStartRow}, Company col: ${companyColIndex}, Total col: ${totalColIndex}`)
        
        // Process data rows starting from detected row
        const dataRows = rawData.slice(dataStartRow)
        console.log(`Processing ${dataRows.length} potential data rows`)
        
        let rowsWithData = 0
        for (const row of dataRows) {
          if (!row || row.length <= Math.max(companyColIndex, totalColIndex)) continue
          
          const companyName = String(row[companyColIndex] || '').trim()
          const totalValue = row[totalColIndex]
          const total = typeof totalValue === 'number' 
            ? totalValue 
            : parseFloat(String(totalValue || '0').replace(/,/g, '')) || 0
          
          // Skip rows that look like totals/summary (company name contains "total" or is empty)
          const lowerName = companyName.toLowerCase()
          if (lowerName.includes('total') || lowerName.includes('grand') || lowerName.includes('summary')) {
            console.log(`Skipping totals row: ${companyName}`)
            continue
          }
          
          // Valid data row: has company name and quantity
          if (companyName && companyName.length > 1 && total !== 0) {
            newData.push({ companyName, total, ownerName })
            rowsWithData++
            console.log(`Added: ${companyName} - ${total} shares`)
          }
        }
        
        console.log(`Found ${rowsWithData} valid data rows in ${file.name}`)
        
        if (rowsWithData === 0) {
          addAlert('warning', `No holding data found in ${file.name}. Check file format.`)
          // Save preview for debugging
          setDebugPreview({ filename: file.name, rows: rawData.slice(0, 15) })
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        addAlert('error', `Error processing ${file.name}: ${error}`)
      }
    }
    
    console.log('Total new data entries:', newData.length)
    
    setAllData(prev => [...prev, ...newData])
    
    // Create pivot table
    if (newData.length > 0 || allData.length > 0) {
      const combinedData = [...allData, ...newData]
      const pivot: PivotData = {}
      
      combinedData.forEach(item => {
        if (!pivot[item.companyName]) {
          pivot[item.companyName] = { 'Total Holdings': 0 }
        }
        pivot[item.companyName][item.ownerName] = 
          (pivot[item.companyName][item.ownerName] || 0) + item.total
        pivot[item.companyName]['Total Holdings'] += item.total
      })
      
      setPivotData(pivot)
      if (newData.length > 0) {
        addAlert('success', `${uploadedFiles.length} file(s) processed - found ${newData.length} holdings!`)
      }
    } else {
      addAlert('warning', 'No holding data could be extracted from the uploaded files.')
    }
  }, [allData])

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.name.endsWith('.xlsx') || file.name.endsWith('.csv')
    )
    
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles])
      processFiles(droppedFiles)
    }
  }, [processFiles])

  // Handle file input
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles])
      processFiles(selectedFiles)
    }
  }

  // Export to CSV
  const exportToCSV = () => {
    if (!pivotData) return
    
    const owners = new Set<string>()
    Object.values(pivotData).forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'Total Holdings') owners.add(key)
      })
    })
    
    const headers = ['Company Name', ...Array.from(owners), 'Total Holdings']
    const rows = Object.entries(pivotData).map(([company, data]) => {
      return [
        company,
        ...Array.from(owners).map(owner => data[owner] || 0),
        data['Total Holdings']
      ]
    })
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pivoted_shareholding.csv'
    a.click()
    URL.revokeObjectURL(url)
    addAlert('success', 'CSV downloaded!')
  }

  // Export to Excel
  const exportToExcel = () => {
    if (!pivotData) return
    
    const owners = new Set<string>()
    Object.values(pivotData).forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'Total Holdings') owners.add(key)
      })
    })
    
    const headers = ['Company Name', ...Array.from(owners), 'Total Holdings']
    const rows = Object.entries(pivotData).map(([company, data]) => {
      return {
        'Company Name': company,
        ...Object.fromEntries(Array.from(owners).map(owner => [owner, data[owner] || 0])),
        'Total Holdings': data['Total Holdings']
      }
    })
    
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Holdings')
    
    const now = new Date()
    const filename = `pivot - ${now.toLocaleDateString('en-GB').replace(/\//g, '-')} - ${now.toLocaleTimeString('en-GB').replace(/:/g, '-')}.xlsx`
    XLSX.writeFile(workbook, filename)
    addAlert('success', 'Excel downloaded!')
  }

  // Save pivot to Supabase
  const savePivot = async () => {
    if (!pivotData || !user) return
    
    setIsSaving(true)
    try {
      const now = new Date()
      const name = `Pivot_${now.toLocaleDateString('en-GB').replace(/\//g, '-')}_${now.toLocaleTimeString('en-GB').replace(/:/g, '-')}`
      
      const { error } = await supabase
        .from('saved_pivots')
        .insert({
          user_id: user.id,
          name,
          data: pivotData
        })
      
      if (error) throw error
      
      addAlert('success', `Saved as ${name}`)
      fetchSavedPivots() // Refresh list
    } catch (error) {
      console.error('Error saving pivot:', error)
      addAlert('error', 'Failed to save pivot')
    } finally {
      setIsSaving(false)
    }
  }

  // Delete saved pivot from Supabase
  const deleteSavedPivot = async () => {
    if (!selectedSavedPivot) return
    
    try {
      const { error } = await supabase
        .from('saved_pivots')
        .delete()
        .eq('id', selectedSavedPivot)
      
      if (error) throw error
      
      const pivotName = savedPivots.find(p => p.id === selectedSavedPivot)?.name
      addAlert('success', `Deleted ${pivotName}`)
      setSelectedSavedPivot('')
      setLoadedPivot(null)
      fetchSavedPivots() // Refresh list
    } catch (error) {
      console.error('Error deleting pivot:', error)
      addAlert('error', 'Failed to delete pivot')
    }
  }

  // Load saved pivot
  const loadSavedPivot = () => {
    const pivot = savedPivots.find(p => p.id === selectedSavedPivot)
    if (pivot) {
      setLoadedPivot(pivot.data)
      addAlert('info', `Loaded ${pivot.name}`)
    }
  }

  // Handle view file upload
  const handleViewFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setViewFile(file)
    
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]
      
      // Convert to pivot format for display
      const headers = jsonData[0] as string[]
      const pivot: PivotData = {}
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number)[]
        const companyName = String(row[0])
        pivot[companyName] = { 'Total Holdings': 0 }
        
        for (let j = 1; j < headers.length; j++) {
          const value = parseFloat(String(row[j])) || 0
          pivot[companyName][headers[j]] = value
          if (headers[j] === 'Total Holdings') {
            pivot[companyName]['Total Holdings'] = value
          }
        }
      }
      
      setViewedPivot(pivot)
    } catch (error) {
      addAlert('error', `Could not load file: ${error}`)
    }
  }

  // Get unique owners from pivot data
  const getOwners = (data: PivotData) => {
    const owners = new Set<string>()
    Object.values(data).forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'Total Holdings') owners.add(key)
      })
    })
    return Array.from(owners)
  }

  // Handle column sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to descending for numbers, ascending for text
      setSortColumn(column)
      setSortDirection(column === 'Company Name' ? 'asc' : 'desc')
    }
  }

  // Get sorted entries from pivot data
  const getSortedEntries = (data: PivotData) => {
    const entries = Object.entries(data)
    
    if (!sortColumn) return entries
    
    return entries.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number
      
      if (sortColumn === 'Company Name') {
        aVal = a[0]
        bVal = b[0]
      } else if (sortColumn === 'Total Holdings') {
        aVal = a[1]['Total Holdings']
        bVal = b[1]['Total Holdings']
      } else {
        aVal = a[1][sortColumn] || 0
        bVal = b[1][sortColumn] || 0
      }
      
      // Handle string comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      
      // Handle number comparison
      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })
  }

  // Get sort icon for column
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="sort-icon inactive" />
    }
    return sortDirection === 'asc' 
      ? <ArrowUp size={14} className="sort-icon active" />
      : <ArrowDown size={14} className="sort-icon active" />
  }

  // Clear all data
  const clearAll = () => {
    setFiles([])
    setAllData([])
    setPivotData(null)
    setLoadedPivot(null)
    setViewedPivot(null)
    setViewFile(null)
  }

  // Show loading state
  if (loading) {
    return (
      <div className="app login-mode">
        <div className="container">
          <div className="login-card">
            <div className="login-header">
              <h1>
                <img src="/logo.png" alt="Logo" className="header-icon-img" />
                Holdings Manager
              </h1>
              <p>Loading...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show configuration error if Supabase is not configured
  if (!isConfigured) {
    return (
      <div className="app login-mode">
        <div className="container">
          <div className="login-card">
            <div className="login-header">
              <h1>
                <img src="/logo.png" alt="Logo" className="header-icon-img" />
                Holdings Manager
              </h1>
              <p>Configuration Required</p>
            </div>
            <div className="info-box" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '8px' }}>
              <AlertCircle size={20} style={{ marginRight: '0.5rem' }} />
              <div>
                <strong>Supabase configuration missing</strong>
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  Please create a <code>.env</code> file in the <code>holdings-manager-react</code> directory with:
                </p>
                <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '0.85rem' }}>
{`VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`}
                </pre>
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  You can find these values in your Supabase project settings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`app ${!user ? 'login-mode' : ''}`}>
      {/* Alerts */}
      <div className="alerts-container">
        {alerts.map((alert, index) => (
          <div key={index} className={`alert alert-${alert.type} animate-slide-in`}>
            {alert.type === 'success' && <CheckCircle size={18} />}
            {alert.type === 'error' && <AlertCircle size={18} />}
            {alert.type === 'warning' && <AlertCircle size={18} />}
            {alert.type === 'info' && <Info size={18} />}
            <span>{alert.message}</span>
          </div>
        ))}
      </div>

      <div className="container">
        {/* Login Section - Only shown when not authenticated */}
        {!user && (
          <div className="login-container">
            <div className="login-content">
              <div className="login-brand">
                <div className="brand-icon">
                  <img src="/logo.png" alt="Holdings Manager" className="brand-logo-img" />
                </div>
                <h1>Holdings Manager</h1>
                <p className="tagline">Simplify your portfolio consolidation</p>
              </div>
              
              <div className="features-grid">
                <div className="feature-item">
                  <div className="feature-icon"><Upload size={20} /></div>
                  <div>
                    <h3>Bulk Upload</h3>
                    <p>Process multiple shareholding files instantly</p>
                  </div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon"><Table size={20} /></div>
                  <div>
                    <h3>Auto Pivot</h3>
                    <p>Automatically consolidate holdings across accounts</p>
                  </div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon"><Save size={20} /></div>
                  <div>
                    <h3>Secure Storage</h3>
                    <p>Save and retrieve your pivot tables securely</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="login-card">
              <div className="login-header">
                <h2>Welcome Back</h2>
                <p>Sign in to access your dashboard</p>
              </div>
              
              <div className="login-form">
                <button 
                  className="btn btn-google btn-login"
                  onClick={handleGoogleLogin}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
                <p className="terms-text">
                  By continuing, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Authenticated Content */}
        {user && (
          <>
            {/* Header with User Info */}
            <header className="header animate-fade-in">
              <div className="header-brand">
                <div className="header-logo">
                  <img src="/logo.png" alt="Holdings Manager" className="header-logo-img" />
                </div>
                <h1>Holdings Manager</h1>
              </div>

              <div className="header-actions">
                <div className="user-info-pill">
                  {user.user_metadata?.avatar_url ? (
                    <img 
                      src={user.user_metadata.avatar_url} 
                      alt="Profile" 
                      className="user-avatar"
                    />
                  ) : (
                    <div className="avatar-placeholder">
                      <User size={16} />
                    </div>
                  )}
                  <span className="user-name">{user.user_metadata?.full_name || user.email}</span>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={handleLogout} title="Sign Out">
                  <LogOut size={20} />
                </button>
              </div>
            </header>

            {/* File Upload Section */}
            <section className="card animate-slide-in">
              <h2>
                <Upload size={24} />
                Upload Files
              </h2>
              <p className="text-muted">Upload as many Excel or CSV shareholding statements as you want</p>
              
              <div 
                className={`dropzone ${isDragging ? 'dropzone-active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload size={48} className="dropzone-icon" />
                <p>Drag and drop files here</p>
                <span className="text-muted">Limit 200MB per file • CSV, XLSX</span>
                <label className="btn btn-secondary">
                  Browse files
                  <input
                    type="file"
                    multiple
                    accept=".csv,.xlsx"
                    onChange={handleFileInput}
                    hidden
                  />
                </label>
              </div>

              {files.length > 0 && (
                <div className="files-list">
                  <h4>Uploaded Files ({files.length})</h4>
                  {files.map((file, index) => (
                    <div key={index} className="file-item">
                      <FileSpreadsheet size={16} />
                      <span>{file.name}</span>
                      <span className="text-muted">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" onClick={clearAll}>
                    <Trash2 size={16} /> Clear All
                  </button>
                </div>
              )}
            </section>

            {/* Debug Preview - shows raw file data when parsing fails */}
            {debugPreview && (
              <section className="card animate-fade-in" style={{ borderColor: '#f59e0b' }}>
                <h2 style={{ color: '#f59e0b' }}>
                  <AlertCircle size={24} />
                  Debug: Raw File Preview - {debugPreview.filename}
                </h2>
                <p className="text-muted">This shows the first 15 rows of your file. Please tell me which column contains the company name and which has the share quantity.</p>
                
                <div className="table-container" style={{ maxHeight: '400px', overflow: 'auto' }}>
                  <table className="data-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#374151' }}>Row</th>
                        {debugPreview.rows[0] && (debugPreview.rows[0] as unknown[]).map((_, colIdx) => (
                          <th key={colIdx} style={{ background: '#374151' }}>Col {colIdx}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {debugPreview.rows.map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          <td style={{ background: '#374151', fontWeight: 'bold' }}>{rowIdx}</td>
                          {(row as unknown[]).map((cell, colIdx) => (
                            <td key={colIdx} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {String(cell ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <button className="btn btn-ghost" onClick={() => setDebugPreview(null)} style={{ marginTop: '1rem' }}>
                  <X size={16} /> Close Preview
                </button>
              </section>
            )}

            {/* Holdings Table */}
            {pivotData && Object.keys(pivotData).length > 0 && (
              <section className="card animate-fade-in">
                <h2>
                  <Table size={24} />
                  Holdings
                </h2>
                
                <div className="table-container">
                  <table className="data-table sortable-table">
                    <thead>
                      <tr>
                        <th className="sortable-header" onClick={() => handleSort('Company Name')}>
                          <span>Company Name</span>
                          {getSortIcon('Company Name')}
                        </th>
                        {getOwners(pivotData).map(owner => (
                          <th key={owner} className="sortable-header" onClick={() => handleSort(owner)}>
                            <span>{owner}</span>
                            {getSortIcon(owner)}
                          </th>
                        ))}
                        <th className="total-column sortable-header" onClick={() => handleSort('Total Holdings')}>
                          <span>Total Holdings</span>
                          {getSortIcon('Total Holdings')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSortedEntries(pivotData).map(([company, data]) => (
                        <tr key={company}>
                          <td>{company}</td>
                          {getOwners(pivotData).map(owner => (
                            <td key={owner}>{(data[owner] || 0).toLocaleString()}</td>
                          ))}
                          <td className="total-column">{data['Total Holdings'].toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="export-buttons">
                  <button className="btn btn-secondary" onClick={exportToCSV}>
                    <Download size={16} /> Download as CSV
                  </button>
                  <button className="btn btn-secondary" onClick={exportToExcel}>
                    <Download size={16} /> Download as Excel
                  </button>
                </div>
              </section>
            )}

            {/* Save/Load Section */}
            <section className="card animate-fade-in">
              <h2>
                <Save size={24} />
                Save/Delete/Load Pivot Table
              </h2>
              
              {pivotData && (
                <button 
                  className="btn btn-primary" 
                  onClick={savePivot}
                  disabled={isSaving}
                >
                  <Save size={16} /> {isSaving ? 'Saving...' : 'Save Pivot Table'}
                </button>
              )}

              {isLoadingPivots ? (
                <p className="text-muted info-box">
                  <Info size={16} /> Loading saved pivots...
                </p>
              ) : savedPivots.length > 0 ? (
                <div className="saved-pivots">
                  <div className="input-group">
                    <label>Select a saved pivot:</label>
                    <select 
                      value={selectedSavedPivot}
                      onChange={(e) => setSelectedSavedPivot(e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      {savedPivots.map(pivot => (
                        <option key={pivot.id} value={pivot.id}>{pivot.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="saved-actions">
                    <button 
                      className="btn btn-destructive"
                      onClick={deleteSavedPivot}
                      disabled={!selectedSavedPivot}
                    >
                      <Trash2 size={16} /> Delete Selected
                    </button>
                    <button 
                      className="btn btn-secondary"
                      onClick={loadSavedPivot}
                      disabled={!selectedSavedPivot}
                    >
                      <Eye size={16} /> Load/View Selected
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-muted info-box">
                  <Info size={16} /> No saved pivots found.
                </p>
              )}

              {/* Loaded Pivot Display */}
              {loadedPivot && (
                <div className="loaded-pivot">
                  <h3>Loaded Pivot: {savedPivots.find(p => p.id === selectedSavedPivot)?.name}</h3>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Company Name</th>
                          {getOwners(loadedPivot).map(owner => (
                            <th key={owner}>{owner}</th>
                          ))}
                          <th className="total-column">Total Holdings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(loadedPivot).map(([company, data]) => (
                          <tr key={company}>
                            <td>{company}</td>
                            {getOwners(loadedPivot).map(owner => (
                              <td key={owner}>{(data[owner] || 0).toLocaleString()}</td>
                            ))}
                            <td className="total-column">{data['Total Holdings'].toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setLoadedPivot(null)}>
                    <X size={16} /> Close
                  </button>
                </div>
              )}
            </section>

            {/* View Downloaded Pivot */}
            <section className="card">
              <h2>
                <FolderOpen size={24} />
                View Downloaded Pivot Table
              </h2>
              <p className="text-muted">Upload a previously downloaded pivot table (CSV or Excel) to view it here.</p>
              
              <div className="dropzone dropzone-small">
                <Upload size={32} className="dropzone-icon" />
                <p>Drag and drop file here</p>
                <span className="text-muted">Limit 200MB per file • CSV, XLSX</span>
                <label className="btn btn-secondary">
                  Browse files
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleViewFile}
                    hidden
                  />
                </label>
              </div>

              {viewedPivot && viewFile && (
                <div className="viewed-pivot animate-fade-in">
                  <h3>Preview: {viewFile.name}</h3>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Company Name</th>
                          {getOwners(viewedPivot).map(owner => (
                            <th key={owner}>{owner}</th>
                          ))}
                          <th className="total-column">Total Holdings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(viewedPivot).map(([company, data]) => (
                          <tr key={company}>
                            <td>{company}</td>
                            {getOwners(viewedPivot).map(owner => (
                              <td key={owner}>{(data[owner] || 0).toLocaleString()}</td>
                            ))}
                            <td className="total-column">{data['Total Holdings'].toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn btn-ghost" onClick={() => { setViewedPivot(null); setViewFile(null) }}>
                    <X size={16} /> Close
                  </button>
                </div>
              )}
            </section>

            {/* Info Message */}
            {!pivotData && files.length === 0 && (
              <div className="info-box">
                <Info size={20} />
                <span>Please upload as many Excel or CSV files as you want to begin.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default App
