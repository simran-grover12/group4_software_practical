const state = {
    user: null,
    outlets: [],
    currentOutlet: null,
    currentMenu: [],
    cart: [],
    currentPage: "dashboard"
};

const $ = (selector) => document.querySelector(selector);

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
    }

    return data;
}

function showToast(message) {
    const toast = $("#toast");

    toast.textContent = message;
    toast.classList.add("visible");

    setTimeout(() => {
        toast.classList.remove("visible");
    }, 3000);
}

function showApp() {
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    $("#user-name").textContent = state.user.name;

    loadOutlets();
    startNotificationPolling();
}

function showLogin() {
    $("#login-screen").classList.remove("hidden");
    $("#app").classList.add("hidden");
}

async function checkSession() {
    try {
        const data = await api("/api/session");

        if (data.authenticated) {
            state.user = data.user;
            showApp();
        } else {
            showLogin();
        }
    } catch (error) {
        showLogin();
    }
}

async function login(event) {
    event.preventDefault();

    const name = $("#login-name").value;
    const email = $("#login-email").value;

    try {
        const data = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                name,
                email
            })
        });

        state.user = data.user;
        showToast("Welcome to Krood OS");
        showApp();
    } catch (error) {
        showToast(error.message);
    }
}

async function logout() {
    await api("/api/logout", {
        method: "POST"
    });

    state.user = null;
    state.cart = [];
    showLogin();
}

async function loadOutlets() {
    try {
        const data = await api("/api/outlets");

        state.outlets = data.outlets;
        restoreOutletOrder();
        renderOutlets();
    } catch (error) {
        showToast(error.message);
    }
}

function renderOutlets() {
    const grid = $("#outlet-grid");
    grid.innerHTML = "";

    state.outlets.forEach((outlet) => {
        const card = document.createElement("article");

        card.className = "outlet-card";
        card.draggable = true;
        card.dataset.outletId = outlet.id;

        card.innerHTML = `
            <div class="outlet-icon">${outlet.image}</div>

            <h3>${outlet.name}</h3>

            <p>${outlet.description}</p>

            <div class="outlet-footer">
                <span class="open-label">
                    ● ${outlet.is_open ? "Open now" : "Closed"}
                </span>

                <button class="view-menu-button">
                    View menu
                </button>
            </div>
        `;

        card.querySelector("button").addEventListener("click", () => {
            openMenu(outlet.id);
        });

        addDragEvents(card);

        grid.appendChild(card);
    });
}

function addDragEvents(card) {
    card.addEventListener("dragstart", () => {
        card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        saveOutletOrder();
    });

    card.addEventListener("dragover", (event) => {
        event.preventDefault();

        const draggingCard = document.querySelector(".dragging");

        if (!draggingCard || draggingCard === card) {
            return;
        }

        const grid = $("#outlet-grid");
        const cards = [...grid.querySelectorAll(".outlet-card")];
        const currentIndex = cards.indexOf(draggingCard);
        const targetIndex = cards.indexOf(card);

        if (currentIndex < targetIndex) {
            grid.insertBefore(draggingCard, card.nextSibling);
        } else {
            grid.insertBefore(draggingCard, card);
        }
    });
}

function saveOutletOrder() {
    const ids = [...document.querySelectorAll(".outlet-card")]
        .map((card) => Number(card.dataset.outletId));

    localStorage.setItem("krood-outlet-order", JSON.stringify(ids));
}

function restoreOutletOrder() {
    const saved = localStorage.getItem("krood-outlet-order");

    if (!saved) {
        return;
    }

    const ids = JSON.parse(saved);

    state.outlets.sort((a, b) => {
        return ids.indexOf(a.id) - ids.indexOf(b.id);
    });
}

async function openMenu(outletId) {
    try {
        const data = await api(`/api/outlets/${outletId}/menu`);

        state.currentOutlet = data.outlet;
        state.currentMenu = data.items;

        $("#dashboard-page").classList.add("hidden");
        $("#menu-page").classList.remove("hidden");

        $("#page-title").textContent = data.outlet.name;

        $("#menu-header").innerHTML = `
            <p class="eyebrow">Campus dining outlet</p>
            <h2>${data.outlet.image} ${data.outlet.name}</h2>
            <p>${data.outlet.description}</p>
        `;

        renderMenu();
    } catch (error) {
        showToast(error.message);
    }
}

function renderMenu() {
    const grid = $("#menu-grid");
    const searchTerm = $("#menu-search").value.toLowerCase();
    const dietaryFilter = $("#diet-filter").value;

    const filteredItems = state.currentMenu.filter((item) => {
        const matchesSearch =
            item.name.toLowerCase().includes(searchTerm) ||
            item.description.toLowerCase().includes(searchTerm);

        const matchesDiet =
            dietaryFilter === "All" ||
            item.dietary_type === dietaryFilter;

        return matchesSearch && matchesDiet;
    });

    grid.innerHTML = "";

    if (filteredItems.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div>🍽️</div>
                <h2>No items found</h2>
                <p>Try changing your search or dietary filter.</p>
            </div>
        `;

        return;
    }

    filteredItems.forEach((item) => {
        const article = document.createElement("article");

        article.className = "menu-item";

        article.innerHTML = `
            <div class="menu-item-top">
                <h3>${item.name}</h3>
                <span class="price">₹${item.price.toFixed(2)}</span>
            </div>

            <p>${item.description}</p>

            <div class="item-meta">
                <span class="meta-pill">${item.category}</span>
                <span class="meta-pill">${item.dietary_type}</span>
                <span class="meta-pill">${item.calories} calories</span>
                <span class="meta-pill">${item.preparation_time} min</span>
            </div>

            <div class="item-action">
                <span class="${item.is_available ? "available" : "unavailable"}">
                    ${item.is_available ? "● Available" : "● Unavailable"}
                </span>

                <button
                    class="add-button"
                    ${item.is_available ? "" : "disabled"}
                >
                    Add to cart
                </button>
            </div>
        `;

        article.querySelector("button").addEventListener("click", () => {
            addToCart(item);
        });

        grid.appendChild(article);
    });
}

function addToCart(item) {
    const existingItem = state.cart.find(
        (cartItem) => cartItem.id === item.id
    );

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        state.cart.push({
            ...item,
            quantity: 1,
            outlet_id: state.currentOutlet.id
        });
    }

    updateCartCount();
    showToast(`${item.name} added to cart`);
}

function updateCartCount() {
    const count = state.cart.reduce(
        (total, item) => total + item.quantity,
        0
    );

    $("#cart-count").textContent = count;
}

function changeQuantity(itemId, change) {
    const item = state.cart.find((cartItem) => cartItem.id === itemId);

    if (!item) {
        return;
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        state.cart = state.cart.filter(
            (cartItem) => cartItem.id !== itemId
        );
    }

    updateCartCount();
    renderCart();
}

function calculateCartTotal() {
    return state.cart.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );
}

function renderCart() {
    const container = $("#cart-container");

    if (state.cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div>🛒</div>
                <h2>Your cart is empty</h2>
                <p>Add food from one of the campus outlets.</p>
            </div>
        `;

        return;
    }

    const total = calculateCartTotal();

    container.innerHTML = `
        <div class="cart-list">
            ${state.cart.map((item) => `
                <div class="cart-row">
                    <div>
                        <strong>${item.name}</strong>
                        <p>₹${item.price.toFixed(2)} each</p>
                    </div>

                    <div class="quantity-controls">
                        <button data-action="decrease" data-id="${item.id}">
                            −
                        </button>

                        <strong>${item.quantity}</strong>

                        <button data-action="increase" data-id="${item.id}">
                            +
                        </button>
                    </div>

                    <strong>
                        ₹${(item.price * item.quantity).toFixed(2)}
                    </strong>
                </div>
            `).join("")}
        </div>

        <div class="cart-summary">
            <div class="summary-line">
                <span>Subtotal</span>
                <strong>₹${total.toFixed(2)}</strong>
            </div>

            <div class="summary-line">
                <span>Campus delivery fee</span>
                <strong>₹0.00</strong>
            </div>

            <div class="summary-line summary-total">
                <span>Total</span>
                <strong>₹${total.toFixed(2)}</strong>
            </div>

            <label for="payment-method">
                Payment method
            </label>

            <select id="payment-method">
                <option>Simulated UPI payment</option>
                <option>Simulated card payment</option>
                <option>Simulated campus wallet</option>
            </select>

            <button id="place-order-button" class="primary-button">
                Pay and place order
            </button>
        </div>
    `;

    container.querySelectorAll("button[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const itemId = Number(button.dataset.id);
            const change =
                button.dataset.action === "increase" ? 1 : -1;

            changeQuantity(itemId, change);
        });
    });

    $("#place-order-button").addEventListener("click", placeOrder);
}

async function placeOrder() {
    if (state.cart.length === 0) {
        showToast("Your cart is empty");
        return;
    }

    const outletIds = [
        ...new Set(state.cart.map((item) => item.outlet_id))
    ];

    if (outletIds.length > 1) {
        showToast("Please order from one outlet at a time");
        return;
    }

    const paymentMethod = $("#payment-method").value;

    try {
        const data = await api("/api/orders", {
            method: "POST",
            body: JSON.stringify({
                outlet_id: outletIds[0],
                payment_method: paymentMethod,
                items: state.cart.map((item) => ({
                    menu_item_id: item.id,
                    quantity: item.quantity
                }))
            })
        });

        state.cart = [];
        updateCartCount();

        showToast(
            `Order #${data.order_id} placed. Ready in about ${data.estimated_time} minutes.`
        );

        navigateTo("orders");
        loadOrders();
    } catch (error) {
        showToast(error.message);
    }
}

async function loadOrders() {
    try {
        const data = await api("/api/orders");
        const container = $("#orders-container");

        if (data.orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div>📦</div>
                    <h2>No orders yet</h2>
                    <p>Your completed orders will appear here.</p>
                </div>
            `;

            return;
        }

        container.innerHTML = data.orders.map((order) => `
            <div class="order-card">
                <div class="order-card-header">
                    <strong>Order #${order.id}</strong>
                    <span class="status">${order.order_status}</span>
                </div>

                <p>${order.outlet_name}</p>

                <p>
                    Total:
                    <strong>₹${order.total.toFixed(2)}</strong>
                </p>

                <p>
                    Estimated preparation time:
                    <strong>${order.estimated_time} minutes</strong>
                </p>

                <p>
                    Payment:
                    <strong>${order.payment_status}</strong>
                </p>

                <small>${order.created_at}</small>
            </div>
        `).join("");
    } catch (error) {
        showToast(error.message);
    }
}

async function loadNotifications() {
    try {
        const data = await api("/api/notifications");
        const container = $("#notifications-container");

        if (data.notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div>🔔</div>
                    <h2>No notifications</h2>
                    <p>You are all caught up.</p>
                </div>
            `;

            return;
        }

        container.innerHTML = data.notifications.map((notification) => `
            <div class="notification-card">
                <strong>🔔 Krood OS</strong>
                <p>${notification.message}</p>
                <small>${notification.created_at}</small>
            </div>
        `).join("");
    } catch (error) {
        showToast(error.message);
    }
}

function startNotificationPolling() {
    loadNotifications();

    setInterval(() => {
        loadNotifications();
    }, 15000);
}

function navigateTo(page) {
    document.querySelectorAll(".page").forEach((pageElement) => {
        pageElement.classList.add("hidden");
    });

    const selectedPage = $(`#${page}-page`);

    if (selectedPage) {
        selectedPage.classList.remove("hidden");
    }

    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
        item.classList.toggle(
            "active",
            item.dataset.page === page
        );
    });

    state.currentPage = page;

    const titles = {
        dashboard: "Good day 👋",
        cart: "My Cart",
        orders: "My Orders",
        notifications: "Notifications",
        favorites: "Favorites",
        feedback: "Feedback"
    };

    $("#page-title").textContent = titles[page] || "Krood OS";

    if (page === "cart") {
        renderCart();
    }

    if (page === "orders") {
        loadOrders();
    }

    if (page === "notifications") {
        loadNotifications();
    }
}

async function submitFeedback(event) {
    event.preventDefault();

    try {
        await api("/api/feedback", {
            method: "POST",
            body: JSON.stringify({
                rating: Number($("#feedback-rating").value),
                comment: $("#feedback-comment").value,
                outlet_id: state.currentOutlet
                    ? state.currentOutlet.id
                    : null
            })
        });

        $("#feedback-form").reset();
        showToast("Thank you for your feedback");
    } catch (error) {
        showToast(error.message);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    $("#login-form").addEventListener("submit", login);

    $("#logout-button").addEventListener("click", logout);

    $("#collapse-sidebar").addEventListener("click", () => {
        $("#sidebar").classList.toggle("collapsed");
    });

    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
        item.addEventListener("click", () => {
            navigateTo(item.dataset.page);
        });
    });

    $("#back-to-dashboard").addEventListener("click", () => {
        $("#menu-page").classList.add("hidden");
        $("#dashboard-page").classList.remove("hidden");
        $("#page-title").textContent = "Good day 👋";
    });

    $("#menu-search").addEventListener("input", renderMenu);
    $("#diet-filter").addEventListener("change", renderMenu);

    $("#feedback-form").addEventListener("submit", submitFeedback);

    checkSession();
});