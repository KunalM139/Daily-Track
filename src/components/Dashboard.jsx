import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase"; // Added auth import here
import { 
  collection, addDoc, query, where, onSnapshot, 
  setDoc, doc, deleteDoc, serverTimestamp, getDocs // Added getDocs
} from "firebase/firestore";
import { deleteUser } from "firebase/auth"; // Added deleteUser
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Trash2, Plus, ChevronLeft, ChevronRight, Calendar, X, Check, UserX } from "lucide-react"; // Added UserX icon
import { 
  format, startOfWeek, addDays, isSameDay, subWeeks, 
  addWeeks, subMonths, addMonths, startOfMonth, endOfMonth, 
  getWeek, eachDayOfInterval, isBefore, startOfToday 
} from 'date-fns';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Dashboard({ user, logout }) {
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  
  // --- INLINE ADDING STATE ---
  const [isAddingInline, setIsAddingInline] = useState(false);
  
  // --- NAVIGATION STATE ---
  const [currentDate, setCurrentDate] = useState(new Date());

  // --- 1. CALCULATE DATES ---
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const currentWeekNumber = getWeek(currentDate);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // --- 2. LOAD DATA ---
  useEffect(() => {
    // Habits
    const qHabits = query(collection(db, "habit_definitions"), where("uid", "==", user.uid));
    
    const unsubHabits = onSnapshot(qHabits, (snapshot) => {
      const habitsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // SORTING: Oldest first -> Newest last
      habitsData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeA - timeB;
      });

      setHabits(habitsData);
    });

    // Completions (Checks)
    const qCompletions = query(collection(db, "habit_completions"), where("uid", "==", user.uid));
    const unsubCompletions = onSnapshot(qCompletions, (snapshot) => {
      setCompletions(snapshot.docs.map(doc => doc.data()));
    });

    return () => { unsubHabits(); unsubCompletions(); };
  }, [user]);

  // --- 3. ACTIONS ---
  
  // Create Habit Function
  const createHabit = async (title, isOneOff = false) => {
    if (!title.trim()) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const habitData = {
      title: title, 
      uid: user.uid, 
      createdAt: serverTimestamp(),
      startDate: todayStr, 
      type: 'recurring' // Default
    };

    if (isOneOff) {
        habitData.type = 'one-off';
        habitData.targetDate = todayStr; 
    }

    await addDoc(collection(db, "habit_definitions"), habitData);
  };

  const handleTopAdd = (e) => {
      e.preventDefault();
      createHabit(newHabit, false); 
      setNewHabit("");
  };

  const handleInlineAdd = (e) => {
      if (e.key === 'Enter') {
          createHabit(e.target.value, true);
          e.target.value = ""; 
          setIsAddingInline(false);
      }
      if (e.key === 'Escape') {
          setIsAddingInline(false);
      }
  };

  // Delete Globally
  const deleteHabitGlobal = async (id) => {
    if(confirm("Delete this habit permanently?")) {
        await deleteDoc(doc(db, "habit_definitions", id));
    }
  };

  // Toggle Check
  const toggleCompletion = async (habitId, dateObj) => {
    if (!isSameDay(dateObj, startOfToday())) return; 
    
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const completionId = `${habitId}_${dateStr}`;
    const isDone = completions.some(c => c.habitId === habitId && c.date === dateStr);

    if (isDone) {
      await deleteDoc(doc(db, "habit_completions", completionId));
    } else {
      await setDoc(doc(db, "habit_completions", completionId), {
        habitId, date: dateStr, uid: user.uid, completed: true
      });
    }
  };

  // --- NEW: DELETE ACCOUNT FUNCTION ---
  const handleDeleteAccount = async () => {
    const confirmed = confirm(
        "⚠️ ARE YOU SURE?\n\nThis will permanently delete your account and all your tracking data.\nYou will be able to create a new account with this email later, but your current data will be gone forever."
    );

    if (!confirmed) return;

    try {
        // 1. Delete all Habit Definitions
        const qHabits = query(collection(db, "habit_definitions"), where("uid", "==", user.uid));
        const habitSnap = await getDocs(qHabits);
        const deletePromises = habitSnap.docs.map(doc => deleteDoc(doc.ref));

        // 2. Delete all Completions
        const qCompletions = query(collection(db, "habit_completions"), where("uid", "==", user.uid));
        const completionSnap = await getDocs(qCompletions);
        completionSnap.docs.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));

        // Wait for database cleanup
        await Promise.all(deletePromises);

        // 3. Delete Authentication User
        await deleteUser(user);
        alert("Account deleted successfully.");

    } catch (error) {
        console.error("Error deleting account:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("Security Alert: Please log out and log back in to prove it's you, then try deleting your account again.");
        } else {
            alert("Error deleting account: " + error.message);
        }
    }
  };

  // --- 4. HELPER FUNCTIONS ---
  const isHabitActiveForDate = (habit, day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      if (habit.type === 'one-off') return habit.targetDate === dateStr;
      if (!habit.startDate) return true; 
      return dateStr >= habit.startDate;
  };

  const visibleHabits = habits.filter(habit => {
      if (habit.type === 'one-off') {
          const weekStartStr = format(weekDays[0], 'yyyy-MM-dd');
          const weekEndStr = format(weekDays[6], 'yyyy-MM-dd');
          return habit.targetDate >= weekStartStr && habit.targetDate <= weekEndStr;
      }
      return true; 
  });

  // --- 5. STATS ---
  const isValidTask = (habit, dateStr) => {
     if (habit.type === 'one-off') return habit.targetDate === dateStr;
     if (habit.startDate && dateStr < habit.startDate) return false;
     return true;
  };

  const monthTotalPossible = habits.reduce((acc, habit) => {
      const validDays = daysInMonth.filter(d => isValidTask(habit, format(d, 'yyyy-MM-dd'))).length;
      return acc + validDays;
  }, 0);

  const monthCompletedCount = completions.filter(c => {
      const habit = habits.find(h => h.id === c.habitId);
      return habit && daysInMonth.some(d => format(d, 'yyyy-MM-dd') === c.date) && isValidTask(habit, c.date);
  }).length;
  
  const monthPercentage = monthTotalPossible > 0 ? Math.round((monthCompletedCount / monthTotalPossible) * 100) : 0;

  const weekTotalPossible = habits.reduce((acc, habit) => {
      const validDays = weekDays.filter(d => isValidTask(habit, format(d, 'yyyy-MM-dd'))).length;
      return acc + validDays;
  }, 0);

  const weekCompletedCount = completions.filter(c => {
      const habit = habits.find(h => h.id === c.habitId);
      return habit && weekDays.some(d => format(d, 'yyyy-MM-dd') === c.date) && isValidTask(habit, c.date);
  }).length;
  
  const weekPercentage = weekTotalPossible > 0 ? Math.round((weekCompletedCount / weekTotalPossible) * 100) : 0;

  const monthlyChartData = {
    labels: ["Done", "Left"],
    datasets: [{
      data: [monthCompletedCount, monthTotalPossible - monthCompletedCount],
      backgroundColor: ["#6366f1", "#e0e7ff"], borderWidth: 0, cutout: "75%",
    }],
  };

  const getInitials = (name) => {
      if(!name) return "DT";
      const parts = name.split(" ");
      if(parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return parts[0].substring(0,2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Calendar size={20} /></div>
             <h1 className="font-bold text-gray-800 text-lg">DailyTrack</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">{user.displayName}</p>
                <div className="flex justify-end gap-3 text-xs">
                    <button onClick={logout} className="text-gray-500 hover:text-indigo-600 font-medium">Logout</button>
                    <button onClick={handleDeleteAccount} className="text-red-400 hover:text-red-600 font-medium flex items-center gap-1">
                        Delete Account
                    </button>
                </div>
            </div>
            <div className="bg-indigo-600 w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold tracking-wider shadow-indigo-200 shadow-md">
                 {getInitials(user.displayName)}
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* LEFT SIDEBAR */}
          <div className="lg:w-1/4 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-lg border border-indigo-50 text-center sticky top-6">
              <div className="flex justify-between items-center mb-4">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16}/></button>
                <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">{format(currentDate, 'MMMM yyyy')}</h2>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16}/></button>
              </div>

              <div className="relative w-40 h-40 mx-auto mb-4">
                <Doughnut data={monthlyChartData} options={{ plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-4xl font-black text-indigo-600">{monthPercentage}%</span>
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Monthly</span>
                </div>
              </div>

              <div className="flex justify-between text-xs text-gray-500 border-t pt-4 mt-2">
                <div><strong className="block text-lg text-gray-800">{monthCompletedCount}</strong>Done</div>
                <div><strong className="block text-lg text-gray-800">{monthTotalPossible}</strong>Goals</div>
              </div>
            </div>
          </div>

          {/* RIGHT MAIN */}
          <div className="lg:w-3/4">
            
            {/* CONTROLS */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-xl w-full md:w-auto justify-between">
                    <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="p-2 hover:bg-white rounded-lg shadow-sm transition"><ChevronLeft size={18} /></button>
                    <div className="text-center px-4">
                        <span className="block text-sm font-semibold text-gray-700">
                            {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d')}
                        </span>
                    </div>
                    <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="p-2 hover:bg-white rounded-lg shadow-sm transition"><ChevronRight size={18} /></button>
                </div>

                {/* TOP INPUT (Standard Recurring Habit) */}
                <form onSubmit={handleTopAdd} className="flex gap-2 w-full md:flex-1">
                    <input 
                        type="text" 
                        value={newHabit}
                        onChange={(e) => setNewHabit(e.target.value)}
                        placeholder="Add a new habit..." 
                        className="bg-gray-50 border-none outline-none p-3 rounded-xl text-sm w-full focus:ring-2 focus:ring-indigo-100 transition"
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-5 rounded-xl shadow-md hover:bg-indigo-700 transition"><Plus size={20}/></button>
                </form>
            </div>

            {/* GRID TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden p-6">
                
                <div className="flex justify-between items-end mb-6 pb-4 border-b border-gray-50">
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Current Week</span>
                        <h2 className="text-2xl font-bold text-gray-800">Week {currentWeekNumber}</h2>
                    </div>
                    <div className="text-right w-1/3">
                        <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
                            <span>Weekly Progress</span>
                            <span>{weekPercentage}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${weekPercentage}%` }}></div>
                        </div>
                    </div>
                </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="pb-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-1/3">Habit</th>
                      {weekDays.map(day => (
                        <th key={day.toString()} className="pb-4 text-center w-[9%]">
                          <div className={`flex flex-col items-center ${isSameDay(day, new Date()) ? "text-indigo-600" : "text-gray-400"}`}>
                            <span className="text-[10px] font-bold uppercase mb-1">{format(day, 'EEE')}</span>
                            <span className={`text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg transition ${isSameDay(day, new Date()) ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : ""}`}>
                                {format(day, 'd')}
                            </span>
                          </div>
                        </th>
                      ))}
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleHabits.length === 0 && (
                        <tr><td colSpan="9" className="py-12 text-center text-gray-400">Add a habit above to start tracking! 🚀</td></tr>
                    )}
                    {visibleHabits.map(habit => (
                      <tr key={habit.id} className="group hover:bg-gray-50/50 transition">
                        <td className="py-4 font-medium text-gray-700 relative">
                            {habit.title}
                        </td>
                        
                        {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const isActive = isHabitActiveForDate(habit, day);
                            const isCompleted = completions.some(c => c.habitId === habit.id && c.date === dateStr);
                            
                            const isPast = isBefore(day, startOfToday());
                            const isToday = isSameDay(day, startOfToday());

                            // If this habit doesn't exist on this day, show dash
                            if (!isActive) return <td key={dateStr} className="py-2 text-center"><span className="text-gray-100">-</span></td>;

                            return (
                                <td key={dateStr} className="py-2 text-center relative group/cell">
                                    <button 
                                        onClick={() => toggleCompletion(habit.id, day)}
                                        disabled={!isToday}
                                        className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center mx-auto
                                            ${!isToday ? "cursor-not-allowed opacity-100" : "cursor-pointer hover:shadow-md"}
                                            ${isCompleted ? "bg-indigo-500 text-white shadow-indigo-200" : ""}
                                            ${isPast && !isCompleted ? "bg-red-50 border border-red-100" : ""}
                                            ${isToday && !isCompleted ? "bg-gray-50 text-transparent hover:bg-gray-100 border border-transparent" : ""}
                                            ${!isPast && !isToday && !isCompleted ? "bg-gray-50/50 border border-transparent text-transparent" : ""}
                                        `}
                                    >
                                        {isCompleted && <Check size={20} strokeWidth={3} />}
                                        {isPast && !isCompleted && <X size={20} className="text-red-400" />}
                                    </button>
                                </td>
                            );
                        })}
                        
                        <td className="py-2 text-center">
                            <button onClick={() => deleteHabitGlobal(habit.id)} className="text-gray-300 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}

                    {/* --- INLINE ADD BUTTON (One-Off Task) --- */}
                    <tr>
                        <td className="py-4 font-medium text-gray-400 text-xs uppercase tracking-wide">
                            {isAddingInline ? "New Task..." : ""}
                        </td>
                        {weekDays.map(day => {
                            const isToday = isSameDay(day, startOfToday());
                            return (
                                <td key={day.toString()} className="py-2 text-center relative">
                                    {isToday ? (
                                        isAddingInline ? (
                                            <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-48 bg-white shadow-xl rounded-xl p-2 border border-indigo-100 z-50">
                                                <input 
                                                    autoFocus
                                                    placeholder="Task Name..."
                                                    className="w-full p-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                                    onKeyDown={handleInlineAdd}
                                                    onBlur={() => setIsAddingInline(false)}
                                                />
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => setIsAddingInline(true)}
                                                className="w-10 h-10 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto transition shadow-sm hover:shadow-md"
                                                title="Add single task for today"
                                            >
                                                <Plus size={20} />
                                            </button>
                                        )
                                    ) : null}
                                </td>
                            );
                        })}
                        <td></td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}