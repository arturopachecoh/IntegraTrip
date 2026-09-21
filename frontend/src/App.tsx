import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Connections from './pages/Connections'
import ToolsList from './pages/ToolsList'
import ToolRunner from './pages/ToolRunner'
import Chat from './pages/Chat'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Todo lo de abajo pasa antes por GET /api/me (ProtectedRoute). */}
      <Route element={<ProtectedRoute />}>
        {/* /connections es también adonde redirige el callback OAuth del backend. */}
        <Route path="/connections" element={<Connections />} />
        <Route path="/connections/:connectionId/tools" element={<ToolsList />} />
        <Route
          path="/connections/:connectionId/tools/:toolName"
          element={<ToolRunner />}
        />
      </Route>

      {/* El chat usa el shell a pantalla completa. */}
      <Route element={<ProtectedRoute variant="full" />}>
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:chatId" element={<Chat />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
