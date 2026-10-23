import { Route, Routes } from 'react-router'
import EntryPage from './pages/EntryPage'
import RoomsPage from './pages/RoomsPage'
import RoomPage from './pages/RoomPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/rooms" element={<RoomsPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  )
}
