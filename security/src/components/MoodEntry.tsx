import React, { useState, useRef, useEffect } from 'react';
import { Camera, Edit3, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { type MoodEntry as MoodEntryType } from '../types';

const MOODS = [
  { id: 1, emoji: '😊', label: 'Happy' },
  { id: 2, emoji: '😢', label: 'Sad' },
  { id: 3, emoji: '😴', label: 'Tired' },
  { id: 4, emoji: '😡', label: 'Angry' },
  { id: 5, emoji: '😰', label: 'Anxious' },
  { id: 6, emoji: '🤔', label: 'Thoughtful' },
  { id: 7, emoji: '😍', label: 'Excited' },
  { id: 8, emoji: '😌', label: 'Peaceful' },
];

export const MoodEntry: React.FC = () => {
  const { user, token } = useAuth();

  const [entry, setEntry] = useState<MoodEntryType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedMoodId, setSelectedMoodId] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadedPhotoName, setUploadedPhotoName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likedByUser, setLikedByUser] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) loadUserEntry();
  }, [user]);

  const loadUserEntry = async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/mood-entry/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch entry');

      const data = await res.json();
      console.log(data);
      if (data.entry) {
        setEntry(data.entry);
        setDescription(data.entry.description);
        setSelectedMoodId(parseInt(data.entry.mood, 10));
        setLikesCount(data.entry.likesCount || 0);
        setLikedByUser(data.entry.likedByUser || false);
        setIsEditing(false);

        if (data.entry.photo_url) {
          await loadPhoto(data.entry.photo_url); // ✅ Ahora es solo el nombre
        } else {
          setPhotoUrl('');
        }
      } else {
        setEntry(null);
        setDescription('');
        setSelectedMoodId(null);
        setPhotoUrl('');
        setIsEditing(true);
      }
    } catch (err) {
      console.error(err);
      setEntry(null);
      setDescription('');
      setSelectedMoodId(null);
      setPhotoUrl('');
      setIsEditing(true);
    }
  };

  const loadPhoto = async (photoName: string) => {
    try {
      const res = await fetch(`http://localhost:4000/uploads/${photoName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return setPhotoUrl('');
      const blob = await res.blob();
      setPhotoUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setPhotoUrl('');
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    console.log('=== FRONTEND UPLOAD DEBUG ===');
    console.log('File selected:', file.name, file.type, file.size);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('photo', file);
      console.log('FormData created, sending request...');

      const res = await fetch('http://localhost:4000/api/mood-entry/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);

      if (!res.ok){
        const errorText = await res.text();
        console.log('Error response:', errorText);
        throw new Error('Photo upload failed');
      } 

      const data = await res.json();
      console.log('Success response:', data);
      setUploadedPhotoName(data.photo_url);

      // Previsualización de la imagen con blob
      await loadPhoto(data.photo_url);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedMoodId || !description.trim()) return;
    setLoading(true);

    try {
      const sanitizedDesc = description.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();

      const body = {
        description: sanitizedDesc,
        mood: selectedMoodId,
        photo_url: uploadedPhotoName || entry?.photo_url || null,
      };

      console.log('=== FRONTEND SAVE DEBUG ===');
      console.log('Entry exists:', !!entry);
      console.log('Entry ID:', entry?.id);
      console.log('Body being sent:', body);

      let res;
      if (entry) {
        console.log('Making PUT request to:', `http://localhost:4000/api/mood-entry/${entry.id}`);
        res = await fetch(`http://localhost:4000/api/mood-entry/${entry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } else {
        console.log('Making POST request...');
        res = await fetch('http://localhost:4000/api/mood-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }

      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);

      if (!res.ok) {
        const errorText = await res.text();
        console.log('Error response:', errorText);
        throw new Error('Failed to save entry');
      }
      const data = await res.json();
      console.log('Success response:', data);
      setEntry(data.entry);
      setUploadedPhotoName(null);
      setIsEditing(false);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!entry) return;

    try {
      const res = await fetch(`http://localhost:4000/api/mood-entry/${entry.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to like');
      const data = await res.json();
      setLikesCount(data.likesCount);
      setLikedByUser(data.likedByUser);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = () => setIsEditing(true);
  const handleCancel = () => {
    if (entry) {
      setDescription(entry.description);
      setSelectedMoodId(parseInt(entry.mood, 10));
      setIsEditing(false);
      if (entry.photo_url) {
        loadPhoto(entry.photo_url); // ✅ Ahora es solo el nombre
      }
    } else {
      setDescription('');
      setSelectedMoodId(null);
      setPhotoUrl('');
      setIsEditing(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            How are you feeling today?
          </h2>

          {/* Photo Upload */}
          <div className="mb-6">
            <div
              className={`relative w-full h-64 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 ${!isEditing ? 'cursor-default' : ''}`}
              onClick={() => isEditing && fileInputRef.current?.click()}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="Mood photo" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <div className="text-center">
                  <Camera className="mx-auto mb-2 text-gray-400" size={48} />
                  <p className="text-gray-500">{isEditing ? 'Click to upload a photo' : 'No photo uploaded'}</p>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
                  <div className="text-white">Uploading...</div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={!isEditing || uploading}
            />
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="How are you feeling?"
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
              rows={4}
              disabled={!isEditing}
            />
          </div>

          {/* Mood */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-4">Select your mood</label>
            <div className="grid grid-cols-4 gap-3">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => isEditing && setSelectedMoodId(m.id)}
                  disabled={!isEditing}
                  className={`p-4 rounded-lg border-2 text-center transition-all ${
                    selectedMoodId === m.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                  } ${!isEditing ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50'}`}
                >
                  <div className="text-2xl mb-1">{m.emoji}</div>
                  <div className="text-xs text-gray-600">{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={loading || !selectedMoodId || !description.trim()}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={20} />
                  {loading ? 'Saving...' : 'Save Entry'}
                </button>
                {(entry || description) && (
                  <button
                    onClick={handleCancel}
                    className="px-6 py-3 border border-gray-300 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50"
                  >
                    <X size={20} /> Cancel
                  </button>
                )}
              </>
            ) : (
              entry && (
                <button
                  onClick={handleEdit}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 flex items-center justify-center gap-2"
                >
                  <Edit3 size={20} /> Edit Entry
                </button>
              )
            )}
            <button
              onClick={handleLike}
              disabled={likedByUser || !user}
              className={`flex items-center gap-2 ${likedByUser ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
            >
              ❤️ {likesCount}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
