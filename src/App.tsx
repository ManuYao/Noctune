import { Route, Routes } from 'react-router'
import CreateRoomPage from './pages/CreateRoomPage'
import EditRoomPage from './pages/EditRoomPage'
import EntryPage from './pages/EntryPage'
import LoginPage from './pages/LoginPage'
import PlaylistPage from './pages/PlaylistPage'
import RegisterPage from './pages/RegisterPage'
import RoomsPage from './pages/RoomsPage'
import RoomPage from './pages/RoomPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/rooms" element={<RoomsPage />} />
      <Route path="/rooms/new" element={<CreateRoomPage />} />
      <Route path="/rooms/:roomId/edit" element={<EditRoomPage />} />
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route path="/playlist" element={<PlaylistPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  )
}
