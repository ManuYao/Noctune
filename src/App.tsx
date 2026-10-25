import { Route, Routes } from 'react-router'
import PageShell from './components/PageShell'
import CreateRoomPage from './pages/CreateRoomPage'
import EditRoomPage from './pages/EditRoomPage'
import EntryPage from './pages/EntryPage'
import LegalNoticePage from './pages/LegalNoticePage'
import LoginPage from './pages/LoginPage'
import PrivacyPage from './pages/PrivacyPage'
import PlaylistPage from './pages/PlaylistPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'
import RulesPage from './pages/RulesPage'
import RoomsPage from './pages/RoomsPage'
import RoomPage from './pages/RoomPage'

export default function App() {
  return (
    <Routes>
      {/* Every page that scrolls ends with the footer of the legal pages; the room fits the window and has none. */}
      <Route element={<PageShell />}>
        <Route path="/" element={<EntryPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/rooms/new" element={<CreateRoomPage />} />
        <Route path="/rooms/:roomId/edit" element={<EditRoomPage />} />
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/inscription" element={<RegisterPage />} />
        <Route path="/playlist" element={<PlaylistPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/confidentialite" element={<PrivacyPage />} />
        <Route path="/regles" element={<RulesPage />} />
        <Route path="/mentions-legales" element={<LegalNoticePage />} />
      </Route>
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  )
}
