document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorMessage = document.getElementById('error-message');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = registerForm.username.value;
            const password = registerForm.password.value;

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (response.ok) {
                    window.location.href = '/login.html'; // Redirect to login on successful registration
                } else {
                    const errorData = await response.json();
                    showError(errorData.message || 'Error en el registro');
                }
            } catch (error) {
                showError('No se pudo conectar con el servidor.');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (response.ok) {
                    const { token } = await response.json();
                    localStorage.setItem('token', token);
                    window.location.href = '/'; // Redirect to main app
                } else {
                    const errorData = await response.json();
                    showError(errorData.message || 'Usuario o contraseña incorrectos');
                }
            } catch (error) {
                showError('No se pudo conectar con el servidor.');
            }
        });
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('d-none');
    }
});
