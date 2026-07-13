import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import frontendClient from '../utils/axiosInstance';

export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const { data } = await frontendClient.post('/user/register', userData);

      if (!data.userInfo)
        return rejectWithValue('Invalid response');

      return data.userInfo;
    }
    catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Something went wrong');
    }
  },
);

export const loginUser = createAsyncThunk(
  'auth/login',
  async (userData, { rejectWithValue }) => {
    try {
      const { data } = await frontendClient.post('/user/login', userData);

      if (!data.userInfo)
        return rejectWithValue('Invalid response');

      return data.userInfo;
    }
    catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Something went wrong');
    }
  },
);

export const checkAuth = createAsyncThunk(
  'auth/check',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await frontendClient.get('/user/me');

      if (!data.userInfo)
        return rejectWithValue('Invalid response');

      return data.userInfo;
    }
    catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Something went wrong');
    }
  },
);

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await frontendClient.post('/user/logout');
      return null;
    }
    catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Something went wrong');
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
  },
  reducers: {
    clearAuth: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
      state.loading = false;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Register User Cases
      // NOTE: does not touch state.loading — App.jsx gates the whole route
      // tree on that flag for the initial checkAuth() call, and flipping it
      // here would unmount Login/Signup mid-submit.
      .addCase(registerUser.pending, (state) => {
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.error = action.payload || 'Something went wrong';
        state.isAuthenticated = false;
        state.user = null;
      })

      // Login User Cases
      .addCase(loginUser.pending, (state) => {
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.error = action.payload || 'Something went wrong';
        state.isAuthenticated = false;
        state.user = null;
      })

      // Check Auth Cases
      .addCase(checkAuth.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(checkAuth.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        // no error — 401 on /me is expected, not an error
      })

      // Logout User Cases
      .addCase(logoutUser.pending, (state) => {
        state.error = null;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.error = action.payload || 'Something went wrong';
        state.isAuthenticated = false;
        state.user = null;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
