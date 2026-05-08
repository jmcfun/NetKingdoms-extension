import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import Map from './Map'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Map />
  </StrictMode>
)
