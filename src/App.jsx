import { useEffect, useState, useRef } from "react";
import { auth, googleProvider } from "./firebase";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import Dashboard from "./components/Dashboard";
import { User, Mail, Lock, LogIn, Chrome, KeyRound, Eye, EyeOff } from "lucide-react";
import emailjs from '@emailjs/browser';

// --- CONFIGURATION ---
// ⚠️ RE-PASTE YOUR KEYS HERE!
const EMAILJS_SERVICE_ID = "service_2em255p"; 
const EMAILJS_TEMPLATE_ID = "template_12u7s5i";
const EMAILJS_PUBLIC_KEY = "jlwZzgRtfY0rPQA6h";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Auth State
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); 
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  
  // This flag ensures we only show dashboard after verification (for Sign Up)
  // For Login, we set it to true immediately.
  const [is2FAVerified, setIs2FAVerified] = useState(false);

  // Tracker to detect Logout vs Page Reload
  const wasLoggedIn = useRef(false);

  // --- 1. AUTH STATE LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // USER LOGGED IN
        setUser(currentUser);
        wasLoggedIn.current = true;
        
        // If we are NOT in the middle of a Sign Up OTP flow, grant access immediately.
        if (!showOtpModal) setIs2FAVerified(true);
      } else {
        // USER LOGGED OUT
        setUser(null);
        setIs2FAVerified(false);

        // CLEANUP: If we were logged in before, wipe the form now.
        if (wasLoggedIn.current) {
            resetState();
            wasLoggedIn.current = false;
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [showOtpModal]);

  // --- 2. RESET FUNCTION ---
  const resetState = () => {
    setEmail("");
    setPassword("");
    setUsername("");
    setEnteredOtp("");
    setError("");
    setShowOtpModal(false);
    setIsLoginMode(true);
    setIs2FAVerified(false);
  };

  // --- 3. LOGOUT ---
  const handleLogout = async () => {
      resetState(); 
      await signOut(auth);
  };

  // --- 4. OTP SENDER ---
  const sendOtp = async (name, userEmail) => {
    if (!userEmail) return;

    setIsSendingOtp(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);

    const templateParams = {
      to_name: name,
      to_email: userEmail,
      passcode: code, 
    };

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );
      setIsSendingOtp(false);
      setShowOtpModal(true);
    } catch (err) {
      console.error("EmailJS Error:", err);
      setIsSendingOtp(false);
      setError("Failed to send code.");
    }
  };

  // --- 5. HANDLE LOGIN (DIRECT - NO OTP) ---
  const handleInitiateLogin = async (e) => {
    e.preventDefault();
    setError("");
    
    if(!email || !password) return;

    try {
      // Direct Login: No OTP sent here.
      await signInWithEmailAndPassword(auth, email, password);
      // The useEffect listener above will catch this and set is2FAVerified = true
    } catch (err) {
      setError("Incorrect email or password.");
    }
  };

  // --- 6. HANDLE SIGN UP (WITH OTP) ---
  const handleInitiateSignUp = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.includes("@")) return setError("Please enter a valid email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (!username.trim()) return setError("Username is required.");

    // Send OTP for verification before creating account
    await sendOtp(username, email);
  };

  // --- 7. VERIFY OTP (For Sign Up Only) ---
  const handleVerifyOtp = async () => {
    if (enteredOtp !== generatedOtp) {
      setError("Invalid Code. Try again.");
      return;
    }

    try {
        // Create Account now that OTP is verified
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: username });
        // The listener will detect the new user and log them in
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError("Email already registered.");
      else setError(err.message);
      setShowOtpModal(false);
    }
  };

  const handleGoogleLogin = async () => {
    try { 
      setError(""); 
      await signInWithPopup(auth, googleProvider);
    } 
    catch (err) { setError("Google Login Failed."); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-indigo-600 font-bold">Loading...</div>;

  // --- DASHBOARD ---
  if (user && is2FAVerified) {
    return <Dashboard user={user} logout={handleLogout} onReset={resetState} />;
  }

  // --- LOGIN UI ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 relative">
      
      {/* OTP MODAL (Only shows during Sign Up) */}
      {showOtpModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-gray-100 animate-fade-in">
            <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
              <KeyRound size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Verify Email</h2>
            <p className="text-gray-500 text-sm mb-6">
              Enter code sent to <br/> <span className="font-bold text-gray-800">{email}</span>
            </p>

            <input 
              type="text" 
              maxLength="6"
              placeholder="000000"
              value={enteredOtp}
              onChange={(e) => setEnteredOtp(e.target.value)}
              className="w-full text-center text-3xl tracking-widest font-bold py-3 border-b-2 border-indigo-200 focus:border-indigo-600 outline-none mb-6 text-gray-800 bg-transparent"
            />

            {error && <p className="text-red-500 text-sm mb-4 font-medium">{error}</p>}

            <button onClick={handleVerifyOtp} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
              Verify & Create Account
            </button>
            <button 
              onClick={() => { setShowOtpModal(false); setEnteredOtp(""); setError(""); signOut(auth); }}
              className="mt-4 text-gray-400 text-sm hover:text-gray-600 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LOGIN CARD */}
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">DailyTrack</h1>
          <p className="text-gray-500 text-sm">{isLoginMode ? "Secure Login" : "Create Account"}</p>
        </div>

        {error && !showOtpModal && (
          <div className="bg-red-50 text-red-500 text-sm p-3 rounded-xl mb-4 text-center border border-red-100 font-medium">{error}</div>
        )}

        <form onSubmit={isLoginMode ? handleInitiateLogin : handleInitiateSignUp} className="space-y-4">
          
          {!isLoginMode && (
            <div className="relative">
              <User className="absolute left-4 top-3.5 text-gray-400" size={20} />
              <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-3.5 text-gray-400" size={20} />
            <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-3.5 text-gray-400" size={20} />
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder={isLoginMode ? "Password" : "Create Password"} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" 
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 transition">
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button 
            type="submit" 
            disabled={isSendingOtp}
            className={`w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 ${isSendingOtp ? "opacity-70 cursor-wait" : ""}`}
          >
            {isSendingOtp ? "Sending OTP..." : isLoginMode ? "Login" : "Sign Up (Verify Email)"}
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="h-px bg-gray-200 flex-1"></div>
          <span className="text-xs text-gray-400 uppercase font-bold">Or</span>
          <div className="h-px bg-gray-200 flex-1"></div>
        </div>

        <button onClick={handleGoogleLogin} className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition flex items-center justify-center gap-2">
          <Chrome size={20} className="text-indigo-600" />
          Continue with Google
        </button>

        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            {isLoginMode ? "Don't have an account?" : "Already have an account?"}
            <button onClick={() => { setIsLoginMode(!isLoginMode); setError(""); }} className="ml-2 text-indigo-600 font-bold hover:underline">
              {isLoginMode ? "Sign Up Free" : "Log In"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;