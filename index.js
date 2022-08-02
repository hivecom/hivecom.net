window.addEventListener("DOMContentLoaded", () => {
  init();
});

/**
 * Initialize any javascript
 */
const DARK_CLASS = "dark-theme";

const ADMINS = [
  {
    name: "Jokler",
    bio: "wait what do you need that for?",
    avatar: "/public/admins/jokler.jpg",
  },
  {
    name: "Kilmanio",
    bio: "i buy 2 guitar pedals / week",
    avatar: "/public/admins/kilmanio.jpg",
  },
  {
    name: "zealsprince",
    bio: "i press buttons",
    avatar: "/public/admins/zealsprince.jpg",
  },
];

const MODERATORS = [
  { name: "dolanske", avatar: "/public/moderators/dolanske.jpg" },
  { name: "Rapid", avatar: "/public/moderators/rapid.png" },
  { name: "Chantaro", avatar: "/public/moderators/chantaro.jpeg" },
  { name: "Silomare", avatar: "/public/moderators/silomare.png" },
  { name: "Yuki", avatar: "./public/moderators/yuki.jpg" },
  { name: "Jarle", avatar: "./public/moderators/jarle.jpg" },
].sort((a, b) => (a.name[0].toLowerCase() > b.name[0].toLocaleLowerCase() ? 1 : -1));

function init() {
  const isDark = localStorage.getItem(DARK_CLASS);

  if (isDark == "true") {
    $("html").addClass(DARK_CLASS);
  }

  $("img").on("error", ({ self }) => {
    $(self).addClass("image-error");
  });

  $("#dark-mode-toggle").click(() => {
    $("html").toggleClass(DARK_CLASS);

    localStorage.setItem(DARK_CLASS, $("html").attr("class").includes(DARK_CLASS) ? true : false);
  });

  // $("#copy").text(`Made in ${new Date().getFullYear()} by <a href="">Mavulp</a>`);
  $("#copy").addChild(`<p>
      Made in ${new Date().getFullYear()} by 
      <a href="https://github.com/Mavulp" target="_blank">Mavulp</a>
    </p>`);

  // Generate admins & moderators
  $("#admins").addChild(({ render }) => {
    return ADMINS.map((admin) => {
      return render("div", { class: "admin" }, [
        render("img", { src: admin.avatar }),
        render("strong", admin.name),
        render("p", admin.bio),
      ]);
    });
  });

  $("#moderators").addChild(({ render }) => {
    return MODERATORS.map((user) => {
      return render("div", { class: "moderator" }, [render("img", { src: user.avatar }), render("strong", user.name)]);
    });
  });

  /**
   * Scroll
   */

  // Get height of entire document
  const height = document.body.scrollHeight;

  // Attach scroll listener to the window
  $(window).on("scroll", () => {
    // Simplify accessing scrolled amount
    const scroll = window.scrollY;

    // Calculate how much percent of the document is scrolled
    // Smooth scrolled value by 5
    const SMOOTHING = 4;
    const percent = Math.round((scroll / height) * 100) / SMOOTHING;

    // Apply CSS to the element
    $(".radial-blob").css({
      // Slowly move the background object with the user. Smooth by 40 times
      transform: `translateY(${(scroll * -1) / 30}px)`,
      backgroundPosition: `${percent}% ${50 + percent}%`,
    });
  });
}
