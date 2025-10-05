// import React, { useState, useEffect } from 'react';
// import { useAuth } from '../contexts/AuthContext';
// import { type MoodEntry as MoodEntryType } from '../types';

// const MOODS = [
//   { id: 1, emoji: '😊', label: 'Happy' },
//   { id: 2, emoji: '😢', label: 'Sad' },
//   { id: 3, emoji: '😴', label: 'Tired' },
//   { id: 4, emoji: '😡', label: 'Angry' },
//   { id: 5, emoji: '😰', label: 'Anxious' },
//   { id: 6, emoji: '🤔', label: 'Thoughtful' },
//   { id: 7, emoji: '😍', label: 'Excited' },
//   { id: 8, emoji: '😌', label: 'Peaceful' },
// ];

// export const SocialMedia: React.FC = () => {
//   const { user, token } = useAuth();
//   const [posts, setPosts] = useState<MoodEntryType[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [searchMood, setSearchMood] = useState('');

//   useEffect(() => {
//     loadPosts();
//   }, []);

//     const loadPosts = async (moodId?: number) => {
//         setLoading(true);
//         try {
//             let url = 'http://localhost:4000/api/mood-entry/all';
//             if (moodId) url += `?mood=${moodId}`;

//             const res = await fetch(url, {
//             headers: { Authorization: `Bearer ${token}` },
//             });

//             if (!res.ok) throw new Error('Failed to fetch posts');
//             const data = await res.json();

//             // Convertir los tipos correctamente
//             const entries: MoodEntryType[] = (data.entries || []).map((p: any) => ({
//             ...p,
//             id: Number(p.id),
//             user_id: Number(p.user_id),
//             mood: Number(p.mood),
//             likes: Array.isArray(p.likes) ? p.likes.map(Number) : [],
//             username: p.username || 'Unknown',
//             photo_url: p.photo || null,
//             }));

//             setPosts(entries);
//         } catch (err) {
//             console.error(err);
//         } finally {
//             setLoading(false);
//         }
//     };


//   const handleLike = async (postId: number) => {
//     if (!user) return;
//     try {
//       const res = await fetch(`http://localhost:4000/api/mood-entry/${postId}/like`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       if (!res.ok) throw new Error('Failed to like');

//       const data = await res.json(); // data.likes = array de user_ids

//       setPosts((prev) =>
//         prev.map((p) =>
//           p.id === postId
//             ? { ...p, likes: data.likes, likedByUser: data.likes.includes(user.id) }
//             : p
//         )
//       );
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   const handleSearch = () => {
//     const moodObj = MOODS.find((m) => m.label.toLowerCase() === searchMood.toLowerCase());
//     if (moodObj) loadPosts(moodObj.id);
//     else loadPosts();
//   };

//   return (
//     <div className="max-w-4xl mx-auto p-6">
//       <h2 className="text-3xl font-bold text-center mb-6">Social Media Feed</h2>

//       {/* Buscador por mood */}
//       <div className="flex mb-6 gap-3">
//         <input
//           type="text"
//           placeholder="Buscar por mood..."
//           value={searchMood}
//           onChange={(e) => setSearchMood(e.target.value)}
//           className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
//         />
//         <button
//           onClick={handleSearch}
//           className="bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600"
//         >
//           Buscar
//         </button>
//       </div>

//       {/* Lista de posts */}
//       {loading ? (
//         <div className="text-center">Cargando posts...</div>
//       ) : posts.length === 0 ? (
//         <div className="text-center text-gray-500">No hay posts disponibles</div>
//       ) : (
//         <div className="space-y-6">
//           {posts.map((post) => {
//             const mood = MOODS.find((m) => m.id === post.mood);
//             const likedByCurrentUser = user?.id ? post.likes.includes(user.id) : false;
//             return (
//               <div key={post.id} className="bg-white rounded-2xl shadow-lg overflow-hidden p-6">
//                 <div className="flex items-center mb-4">
//                   <div className="font-bold text-lg">{post.username}</div>
//                   {mood && <div className="ml-2 text-xl">{mood.emoji}</div>}
//                 </div>

//                 {post.photo_url && (
//                   <img src={post.photo_url} alt="Post" className="w-full h-64 object-cover rounded-xl mb-4" />
//                 )}

//                 <p className="mb-4">{post.description}</p>

//                 <div className="flex items-center gap-4">
//                   <button
//                     onClick={() => handleLike(post.id)}
//                     disabled={likedByCurrentUser}
//                     className={`flex items-center gap-2 ${
//                       likedByCurrentUser ? 'text-red-500' : 'text-gray-400 hover:text-red-400'
//                     }`}
//                   >
//                     ❤️ {post.likes.length}
//                   </button>
//                   <span className="text-sm text-gray-500">{likedByCurrentUser ? 'Ya te gusta' : ''}</span>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// };
