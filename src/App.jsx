import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { authApi, ensureCsrf, tasksApi } from './api';

const AuthContext = createContext(null);
const messageFor = (error, fallback) => {
  const data = error.response?.data;
  if (data?.message) {
    const details = Object.entries(data.validationErrors || {})
      .map(([field, message]) => `${field}: ${message}`)
      .join('; ');
    return details ? `${data.message} (${details})` : data.message;
  }
  if (!error.response) return 'Cannot reach the TaskFlow API. Start Eureka and the API Gateway at localhost:8761 and localhost:8080, then retry.';
  return fallback;
};

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const expired = () => setUser(null);
    window.addEventListener('taskflow:session-expired', expired);
    ensureCsrf()
      .then(() => authApi.get('/auth/me'))
      .then(({ data }) => { if (active) setUser(data); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener('taskflow:session-expired', expired); };
  }, []);
  const value = useMemo(() => ({ user, loading, setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function useAuth() { return useContext(AuthContext); }

function Notice({ message, type = 'danger' }) { return message ? <div className={`alert alert-${type}`} role="alert">{message}</div> : null; }
function Loading() { return <div className="text-center p-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div></div>; }
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace state={{ from: location }} />;
}
function Shell({ children }) {
  const { user, setUser } = useAuth();
  const [error, setError] = useState('');
  async function logout() {
    try { await authApi.post('/auth/logout'); } catch { /* Expired cookies are cleared locally below. */ }
    setUser(null);
  }
  return <><nav className="navbar navbar-expand bg-white border-bottom"><div className="container"><Link className="navbar-brand fw-bold text-primary" to="/">TaskFlow</Link><div className="navbar-nav ms-auto align-items-center"><NavLink className="nav-link" to="/">Dashboard</NavLink><NavLink className="nav-link" to="/tasks">Tasks</NavLink><NavLink className="nav-link" to="/tasks/new">Add task</NavLink>{user ? <><span className="navbar-text ms-2 me-3">{user.name}</span><button className="btn btn-sm btn-outline-secondary" onClick={logout}>Log out</button></> : <><NavLink className="nav-link" to="/login">Login</NavLink><NavLink className="nav-link" to="/register">Register</NavLink></>}</div></div></nav><main className="container py-4"><Notice message={error}/>{children}</main></>;
}
function Dashboard() {
  const [tasks,setTasks]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  async function load(){try{const r=await tasksApi.get('/tasks');setTasks(r.data);setError('');}catch{setError('Could not load tasks. Check that the services are running.');}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  const counts=useMemo(()=>({total:tasks.length,pending:tasks.filter(t=>t.status==='PENDING').length,progress:tasks.filter(t=>t.status==='IN_PROGRESS').length,completed:tasks.filter(t=>t.status==='COMPLETED').length}),[tasks]);
  return <><div className="d-flex justify-content-between align-items-center mb-4"><div><h1 className="h3 mb-1">Good work starts here</h1><p className="text-secondary mb-0">Your task overview</p></div><Link className="btn btn-primary" to="/tasks/new">+ New task</Link></div><Notice message={error}/>{loading?<Loading/>:<><div className="row g-3">{[['Total tasks',counts.total,'primary'],['Pending',counts.pending,'warning'],['In progress',counts.progress,'info'],['Completed',counts.completed,'success']].map(([label,value,color])=><div className="col-6 col-lg-3" key={label}><div className="card metric-card h-100"><div className="card-body"><div className="text-secondary">{label}</div><div className={`display-6 fw-semibold text-${color}`}>{value}</div></div></div></div>)}</div><div className="card mt-4"><div className="card-body"><div className="d-flex justify-content-between"><h2 className="h5">Recent tasks</h2><Link to="/tasks">View all</Link></div><TaskRows tasks={tasks.slice(0,5)} refresh={load}/></div></div></>}</>;
}
function TaskRows({tasks,refresh}) {
  const [error,setError]=useState('');
  async function remove(id){try{await tasksApi.delete(`/tasks/${id}`);await refresh();}catch(err){setError(messageFor(err,'Could not delete task.'));}}
  return <><Notice message={error}/>{tasks.length===0?<p className="text-secondary py-3 mb-0">No tasks yet. Create one to get started.</p>:<div className="table-responsive"><table className="table align-middle"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due date</th><th></th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td><div className="fw-semibold">{t.title}</div><small className="text-secondary">{t.description}</small></td><td><span className="badge text-bg-light">{t.status.replace('_',' ')}</span></td><td>{t.priority}</td><td>{t.dueDate||'—'}</td><td className="text-end text-nowrap"><Link className="btn btn-sm btn-outline-primary me-2" to={`/tasks/${t.id}/edit`}>Edit</Link><button className="btn btn-sm btn-outline-danger" onClick={()=>remove(t.id)}>Delete</button></td></tr>)}</tbody></table></div>}</>;
}
function TaskList(){
  const [tasks,setTasks]=useState([]),[status,setStatus]=useState(''),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  async function load(){setLoading(true);try{const r=await tasksApi.get('/tasks',{params:{...(status?{status}:{}),...(query?{title:query}:{})}});setTasks(r.data);setError('');}catch(err){setError(messageFor(err,'Could not load tasks.'));}finally{setLoading(false);}}
  useEffect(()=>{const timer=setTimeout(load,250);return()=>clearTimeout(timer);},[status,query]);
  return <><div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><h1 className="h3">Tasks</h1><p className="text-secondary mb-0">Search and manage your work</p></div><Link to="/tasks/new" className="btn btn-primary">+ Add task</Link></div><div className="row g-2 mb-3"><div className="col-md-8"><input className="form-control" placeholder="Search titles" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="col-md-4"><select className="form-select" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option>PENDING</option><option>IN_PROGRESS</option><option>COMPLETED</option></select></div></div><Notice message={error}/>{loading?<Loading/>:<TaskRows tasks={tasks} refresh={load}/>}</>;
}
function TaskForm(){
  const {id}=useParams(),navigate=useNavigate(),editing=Boolean(id);
  const [form,setForm]=useState({title:'',description:'',status:'PENDING',priority:'MEDIUM',dueDate:''}),[error,setError]=useState(''),[success,setSuccess]=useState(''),[loading,setLoading]=useState(editing);
  useEffect(()=>{if(editing)tasksApi.get(`/tasks/${id}`).then(r=>setForm({...r.data,dueDate:r.data.dueDate||''})).catch(err=>setError(messageFor(err,'Could not load this task.'))).finally(()=>setLoading(false));},[id]);
  function change(e){setForm({...form,[e.target.name]:e.target.value});}
  async function submit(e){e.preventDefault();setError('');setSuccess('');const data={...form,dueDate:form.dueDate||null};try{if(editing)await tasksApi.put(`/tasks/${id}`,data);else await tasksApi.post('/tasks',data);setSuccess('Task saved.');setTimeout(()=>navigate('/tasks'),500);}catch(err){setError(messageFor(err,'Could not save task. Check the form.'));}}
  if(loading)return <Loading/>;
  return <div className="form-wrap"><h1 className="h3 mb-4">{editing?'Edit task':'Add a task'}</h1><Notice type="success" message={success}/><Notice message={error}/><form onSubmit={submit}><div className="mb-3"><label className="form-label" htmlFor="title">Title</label><input id="title" name="title" maxLength="160" required className="form-control" value={form.title} onChange={change}/></div><div className="mb-3"><label className="form-label" htmlFor="description">Description</label><textarea id="description" name="description" maxLength="2000" rows="4" className="form-control" value={form.description||''} onChange={change}/></div><div className="row g-3"><div className="col-md-4"><label className="form-label">Status</label><select name="status" className="form-select" value={form.status} onChange={change}><option>PENDING</option><option>IN_PROGRESS</option><option>COMPLETED</option></select></div><div className="col-md-4"><label className="form-label">Priority</label><select name="priority" className="form-select" value={form.priority} onChange={change}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></div><div className="col-md-4"><label className="form-label">Due date</label><input name="dueDate" type="date" className="form-control" value={form.dueDate||''} onChange={change}/></div></div><div className="mt-4 d-flex gap-2"><button className="btn btn-primary" type="submit">Save task</button><button type="button" className="btn btn-outline-secondary" onClick={()=>navigate('/tasks')}>Cancel</button></div></form></div>;
}
function Register(){
  const [form,setForm]=useState({name:'',email:'',password:''}),[message,setMessage]=useState(''),[kind,setKind]=useState('danger'),[busy,setBusy]=useState(false);const navigate=useNavigate();const {setUser}=useAuth();
  async function submit(e){e.preventDefault();setBusy(true);try{await ensureCsrf();await authApi.post('/auth/register',form);const {data}=await authApi.post('/auth/login',{email:form.email,password:form.password});setUser(data);navigate('/');}catch(err){setKind('danger');setMessage(messageFor(err,'Registration failed.'));}finally{setBusy(false);}}
  return <div className="form-wrap"><h1 className="h3 mb-3">Create your account</h1><Notice type={kind} message={message}/><form onSubmit={submit}><label className="form-label">Name</label><input className="form-control mb-3" required maxLength="100" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><label className="form-label">Email</label><input className="form-control mb-3" required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><label className="form-label">Password</label><input className="form-control mb-3" required minLength="8" maxLength="72" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><button disabled={busy} className="btn btn-primary w-100">{busy?'Creating account…':'Register'}</button></form><p className="text-secondary small mt-3">Your password is BCrypt-hashed. The access token is kept in an HttpOnly cookie.</p></div>;
}
function Login(){
  const [form,setForm]=useState({email:'',password:''}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const navigate=useNavigate(),location=useLocation();const {setUser}=useAuth();
  async function submit(e){e.preventDefault();setBusy(true);setMessage('');try{await ensureCsrf();const {data}=await authApi.post('/auth/login',form);setUser(data);navigate(location.state?.from?.pathname||'/',{replace:true});}catch(err){setMessage(messageFor(err,'Login failed. Check your email and password.'));}finally{setBusy(false);}}
  return <div className="form-wrap"><h1 className="h3 mb-3">Login</h1><Notice message={message}/><form onSubmit={submit}><label className="form-label">Email</label><input className="form-control mb-3" required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><label className="form-label">Password</label><input className="form-control mb-3" required type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><button disabled={busy} className="btn btn-primary w-100">{busy?'Signing in…':'Login'}</button></form><Link to="/register" className="d-block text-center mt-3">Create an account</Link></div>;
}
function AppRoutes(){return <Shell><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/" element={<ProtectedRoute><Dashboard/></ProtectedRoute>}/><Route path="/tasks" element={<ProtectedRoute><TaskList/></ProtectedRoute>}/><Route path="/tasks/new" element={<ProtectedRoute><TaskForm/></ProtectedRoute>}/><Route path="/tasks/:id/edit" element={<ProtectedRoute><TaskForm/></ProtectedRoute>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell>;}
export default function App(){return <AuthProvider><AppRoutes/></AuthProvider>;}
