const state = {
    user: null,
    outlets: [],
    currentOutlet: null,
    currentMenu: [],
    cart: [],
    favorites: new Set(),
    pickupLocations: [],
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

function saveCart() {
    localStorage.setItem(
        "krood-cart",
        JSON.stringify(state.cart)
    );
}

function loadCart() {
    const savedCart = localStorage.getItem("krood-cart");

    if (!savedCart) {
        state.cart = [];
        return;
    }

    try {
        state.cart = JSON.parse(savedCart);
    } catch (error) {
        state.cart = [];
    }

    updateCartCount();
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

    saveCart();
    updateCartCount();
    showToast(`${item.name} added to cart`);
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

    loadCart();
    loadFavorites();
    loadPickupLocations();
    loadOutlets();
    loadRecentlyOrdered();
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

                <div>
                    <button
                        class="favorite-button ${isFavorite ? "is-favorite" : ""}"
                        title="Add to favourites"
                    >
                        ${isFavorite ? "♥" : "♡"}
                    </button>

                    <span class="price">
                        ₹${item.price.toFixed(2)}
                    </span>
                </div>
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
        article.querySelector(".add-button").addEventListener(
            "click",
            () => {
                addToCart(item);
            }
        );

        article.querySelector(".favorite-button").addEventListener(
            "click",
            () => {
                toggleFavorite(item.id);
            }
        );

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
    const item = state.cart.find(
        (cartItem) => cartItem.id === itemId
    );

    if (!item) {
        return;
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        state.cart = state.cart.filter(
            (cartItem) => cartItem.id !== itemId
        );
    }

    saveCart();
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

    const pickupLocationOptions = state.pickupLocations.map(
        (location) => `
            <option value="${location.id}">
                ${location.name}
            </option>
        `
    ).join("");

    container.innerHTML = `
        <div class="cart-list">
            ${state.cart.map((item) => `
                <div class="cart-row">
                    <div>
                        <strong>${item.name}</strong>
                        <p>₹${item.price.toFixed(2)} each</p>
                    </div>

                    <div class="quantity-controls">
                        <button
                            data-action="decrease"
                            data-id="${item.id}"
                        >
                            −
                        </button>

                        <strong>${item.quantity}</strong>

                        <button
                            data-action="increase"
                            data-id="${item.id}"
                        >
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

            <div class="order-options">
                <h3>Pickup details</h3>

                <label for="pickup-location">
                    Pickup location
                </label>

                <select id="pickup-location" required>
                    <option value="">
                        Select a pickup location
                    </option>
                    ${pickupLocationOptions}
                </select>

                <label for="pickup-time">
                    Pickup time
                </label>

                <input
                    id="pickup-time"
                    type="datetime-local"
                    required
                >

                <small>
                    Choose when you want to collect your order.
                </small>

                <label for="order-notes">
                    Order notes
                </label>

                <textarea
                    id="order-notes"
                    placeholder="Example: Please pack the sauce separately."
                ></textarea>

                <label for="allergy-information">
                    Allergy information
                </label>

                <textarea
                    id="allergy-information"
                    placeholder="Example: I am allergic to peanuts."
                ></textarea>

                <p class="warning-note">
                    Please still inform the outlet directly about serious
                    allergies. This field is only an additional notification.
                </p>
            </div>

            <label for="payment-method">
                Payment method
            </label>

            <select id="payment-method">
                <option>Simulated UPI payment</option>
                <option>Simulated card payment</option>
                <option>Simulated campus wallet</option>
            </select>

            <button
                id="place-order-button"
                class="primary-button"
            >
                Pay and place order
            </button>
        </div>
    `;

    container.querySelectorAll(
        "button[data-action]"
    ).forEach((button) => {
        button.addEventListener("click", () => {
            const itemId = Number(button.dataset.id);

            const change =
                button.dataset.action === "increase"
                    ? 1
                    : -1;

            changeQuantity(itemId, change);
        });
    });

    $("#place-order-button").addEventListener(
        "click",
        placeOrder
    );
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

    const pickupLocationId = $("#pickup-location").value;
    const pickupTime = $("#pickup-time").value;
    const orderNotes = $("#order-notes").value;
    const allergyInformation = $("#allergy-information").value;
    const paymentMethod = $("#payment-method").value;

    if (!pickupLocationId) {
        showToast("Please select a pickup location");
        return;
    }

    if (!pickupTime) {
        showToast("Please select a pickup time");
        return;
    }

    const selectedTime = new Date(pickupTime);
    const now = new Date();

    if (selectedTime <= now) {
        showToast("Pickup time must be in the future");
        return;
    }

    try {
        const data = await api("/api/orders", {
            method: "POST",
            body: JSON.stringify({
                outlet_id: outletIds[0],
                payment_method: paymentMethod,
                pickup_location_id: Number(pickupLocationId),
                pickup_time: pickupTime,
                order_notes: orderNotes,
                allergy_information: allergyInformation,
                items: state.cart.map((item) => ({
                    menu_item_id: item.id,
                    quantity: item.quantity
                }))
            })
        });

        state.cart = [];
        saveCart();
        updateCartCount();

        showToast(
            `Order #${data.order_id} placed successfully`
        );

        navigateTo("orders");
        loadOrders();
        loadRecentlyOrdered();
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

        container.innerHTML = data.orders.map((order) => {
            const canCancel = ![
                "Ready",
                "Completed",
                "Cancelled"
            ].includes(order.order_status);

            return `
                <div class="order-card">
                    <div class="order-card-header">
                        <strong>Order #${order.id}</strong>

                        <span class="status">
                            ${order.order_status}
                        </span>
                    </div>

                    <p>${order.outlet_name}</p>

                    <p>
                        Total:
                        <strong>
                            ₹${Number(order.total).toFixed(2)}
                        </strong>
                    </p>

                    <p>
                        Estimated preparation time:
                        <strong>
                            ${order.estimated_time} minutes
                        </strong>
                    </p>

                    <p>
                        Pickup location:
                        <strong>
                            ${order.pickup_location_name || "Not specified"}
                        </strong>
                    </p>

                    <p>
                        Pickup time:
                        <strong>
                            ${order.pickup_time || "Not specified"}
                        </strong>
                    </p>

                    ${
                        order.order_notes
                            ? `
                                <p>
                                    Order notes:
                                    <strong>
                                        ${order.order_notes}
                                    </strong>
                                </p>
                            `
                            : ""
                    }

                    ${
                        order.allergy_information
                            ? `
                                <p class="warning-note">
                                    Allergy information:
                                    <strong>
                                        ${order.allergy_information}
                                    </strong>
                                </p>
                            `
                            : ""
                    }

                    <p>
                        Payment:
                        <strong>${order.payment_status}</strong>
                    </p>

                    <small>${order.created_at}</small>

                    ${
                        canCancel
                            ? `
                                <br>
                                <button
                                    class="cancel-order-button"
                                    data-order-id="${order.id}"
                                >
                                    Cancel order
                                </button>
                            `
                            : ""
                    }
                </div>
            `;
        }).join("");

        container.querySelectorAll(
            ".cancel-order-button"
        ).forEach((button) => {
            button.addEventListener("click", () => {
                cancelOrder(Number(button.dataset.orderId));
            });
        });
    } catch (error) {
        showToast(error.message);
    }
}

async function cancelOrder(orderId) {
    const confirmed = window.confirm(
        `Are you sure you want to cancel order #${orderId}?`
    );

    if (!confirmed) {
        return;
    }

    try {
        await api(`/api/orders/${orderId}/cancel`, {
            method: "POST"
        });

        showToast(`Order #${orderId} cancelled`);
        loadOrders();
        loadNotifications();
    } catch (error) {
        showToast(error.message);
    }
}

async function renderFavoritesPage() {
    try {
        const data = await api("/api/favorites");
        const container = $("#favorites-grid");

        if (data.favorites.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div>❤️</div>
                    <h2>No favourites yet</h2>
                    <p>
                        Tap the heart icon on a menu item to save it here.
                    </p>
                </div>
            `;

            return;
        }

        container.innerHTML = data.favorites.map((item) => `
            <article class="menu-item">
                <div class="menu-item-top">
                    <h3>${item.name}</h3>
                    <span class="price">
                        ₹${Number(item.price).toFixed(2)}
                    </span>
                </div>

                <p>${item.description}</p>

                <div class="item-meta">
                    <span class="meta-pill">${item.category}</span>
                    <span class="meta-pill">
                        ${item.dietary_type}
                    </span>
                </div>

                <div class="item-action">
                    <span class="available">
                        ${item.is_available ? "● Available" : "● Unavailable"}
                    </span>

                    <button
                        class="add-button"
                        ${item.is_available ? "" : "disabled"}
                    >
                        Add to cart
                    </button>
                </div>
            </article>
        `).join("");

        container.querySelectorAll(".add-button").forEach(
            (button, index) => {
                button.addEventListener("click", () => {
                    addFavoriteToCart(data.favorites[index]);
                });
            }
        );
    } catch (error) {
        showToast(error.message);
    }
}
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

    if (page === "favorites") {
        renderFavoritesPage();
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

async function loadPickupLocations() {
    try {
        const data = await api("/api/pickup-locations");

        state.pickupLocations = data.pickup_locations;
    } catch (error) {
        showToast(error.message);
    }
}

async function loadFavorites() {
    try {
        const data = await api("/api/favorites");

        state.favorites = new Set(
            data.favorites.map((item) => item.id)
        );
    } catch (error) {
        showToast(error.message);
    }
}

async function toggleFavorite(menuItemId) {
    try {
        const data = await api("/api/favorites/toggle", {
            method: "POST",
            body: JSON.stringify({
                menu_item_id: menuItemId
            })
        });

        if (data.is_favorite) {
            state.favorites.add(menuItemId);
            showToast("Added to favourites");
        } else {
            state.favorites.delete(menuItemId);
            showToast("Removed from favourites");
        }

        renderMenu();
    } catch (error) {
        showToast(error.message);
    }
}

async function loadRecentlyOrdered() {
    try {
        const data = await api("/api/recently-ordered");
        const container = $("#recently-ordered-grid");

        if (!data.recently_ordered.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div>🍽️</div>
                    <h2>No previous orders</h2>
                    <p>Your recent items will appear here after ordering.</p>
                </div>
            `;

            return;
        }

        container.innerHTML = data.recently_ordered.map((item) => `
            <article class="recent-item">
                <h3>${item.name}</h3>

                <p>
                    ${item.outlet_name}<br>
                    ₹${item.price.toFixed(2)} · ${item.dietary_type}
                </p>

                <div class="recent-item-footer">
                    <span class="available">
                        ${item.is_available ? "Available" : "Unavailable"}
                    </span>

                    <button
                        class="reorder-button"
                        data-item-id="${item.id}"
                        ${item.is_available ? "" : "disabled"}
                    >
                        Add again
                    </button>
                </div>
            </article>
        `).join("");

        container.querySelectorAll(".reorder-button").forEach((button) => {
            button.addEventListener("click", async () => {
                const itemId = Number(button.dataset.itemId);
                const item = data.recently_ordered.find(
                    (recentItem) => recentItem.id === itemId
                );

                await addRecentlyOrderedItem(item);
            });
        });
    } catch (error) {
        showToast(error.message);
    }
}

async function addRecentlyOrderedItem(item) {
    const outletData = await api(
        `/api/outlets/${item.outlet_id}/menu`
    );

    const currentItem = outletData.items.find(
        (menuItem) => menuItem.id === item.id
    );

    if (!currentItem || !currentItem.is_available) {
        showToast("This item is currently unavailable");
        return;
    }

    const existingItem = state.cart.find(
        (cartItem) => cartItem.id === currentItem.id
    );

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        state.cart.push({
            ...currentItem,
            quantity: 1,
            outlet_id: currentItem.outlet_id
        });
    }

    saveCart();
    updateCartCount();
    showToast(`${currentItem.name} added to cart`);
}

function addFavoriteToCart(item) {
    const existingItem = state.cart.find(
        (cartItem) => cartItem.id === item.id
    );

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        state.cart.push({
            ...item,
            quantity: 1,
            outlet_id: item.outlet_id
        });
    }

    saveCart();
    updateCartCount();
    showToast(`${item.name} added to cart`);
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